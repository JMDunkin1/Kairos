export const portfolioSymbols = ['UNG', 'VOO', 'QQQM'];
export const money = (value) => Math.round((value + Number.EPSILON) * 100) / 100;
const finite = (value) => typeof value === 'number' && Number.isFinite(value);
const exactKeys = (value, keys) => Boolean(value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === keys.length && Object.keys(value).every(key => keys.includes(key)));
function requireValue(ok, message) { if (!ok)
    throw new Error(message); }
function range(value, min, max, label) { requireValue(finite(value) && value >= min && value <= max, `${label} must be between ${min} and ${max}.`); }
export function defaultPortfolio(strategies) {
    return { schemaVersion: 1, capitalUsd: 100_000, paused: false,
        limits: { cashReservePct: 5, maxGrossPct: 100, maxSymbolPct: 80, maxTurnoverPct: 100, maxDailyLossPct: 12, maxDrawdownPct: 25 },
        allocations: strategies.map(s => ({ strategyId: s.id, enabled: false, capitalUsd: 0, riskScale: 1, maxGrossPct: 100 })) };
}
export function validatePortfolio(value, strategies) {
    requireValue(exactKeys(value, ['schemaVersion', 'capitalUsd', 'paused', 'limits', 'allocations']), 'Invalid portfolio configuration fields.');
    const config = value;
    requireValue(config.schemaVersion === 1 && typeof config.paused === 'boolean', 'Invalid portfolio version or pause state.');
    range(config.capitalUsd, 1, 1_000_000_000, 'Portfolio capital');
    requireValue(money(config.capitalUsd) === config.capitalUsd, 'Capital must use whole cents.');
    const limits = ['cashReservePct', 'maxGrossPct', 'maxSymbolPct', 'maxTurnoverPct', 'maxDailyLossPct', 'maxDrawdownPct'];
    requireValue(exactKeys(config.limits, limits), 'Invalid portfolio risk controls.');
    range(config.limits.cashReservePct, 0, 100, 'Cash reserve');
    range(config.limits.maxGrossPct, 0, 300, 'Portfolio gross exposure');
    range(config.limits.maxSymbolPct, 0, 300, 'Symbol gross exposure');
    range(config.limits.maxTurnoverPct, 0, 600, 'Rebalance turnover');
    range(config.limits.maxDailyLossPct, 0.1, 100, 'Daily loss stop');
    range(config.limits.maxDrawdownPct, 0.1, 100, 'Drawdown stop');
    requireValue(Array.isArray(config.allocations) && config.allocations.length <= strategies.length, 'Invalid allocation list.');
    const seen = new Set(), ids = new Set(strategies.map(s => s.id));
    for (const allocation of config.allocations) {
        requireValue(exactKeys(allocation, ['strategyId', 'enabled', 'capitalUsd', 'riskScale', 'maxGrossPct']), 'Invalid strategy allocation fields.');
        requireValue(ids.has(allocation.strategyId) && !seen.has(allocation.strategyId), 'Unknown or duplicate strategy allocation.');
        seen.add(allocation.strategyId);
        requireValue(typeof allocation.enabled === 'boolean', 'Invalid strategy participation state.');
        range(allocation.capitalUsd, 0, config.capitalUsd, 'Strategy capital');
        requireValue(money(allocation.capitalUsd) === allocation.capitalUsd, 'Strategy capital must use whole cents.');
        range(allocation.riskScale, 0, 3, 'Strategy risk scale');
        range(allocation.maxGrossPct, 0, 300, 'Strategy gross exposure');
    }
    requireValue(money(config.allocations.reduce((sum, a) => sum + a.capitalUsd, 0)) <= config.capitalUsd, 'Strategy budgets exceed portfolio capital.');
    // New registrations enter unallocated; removing an allocated identity requires an explicit migration.
    return { ...config, limits: { ...config.limits }, allocations: strategies.map(s => ({ ...(config.allocations.find(a => a.strategyId === s.id) ?? { strategyId: s.id, enabled: false, capitalUsd: 0, riskScale: 1, maxGrossPct: 100 }) })) };
}
export function fresh(timestamp, now, maxAgeMs) {
    if (typeof timestamp !== 'string' || !finite(maxAgeMs) || maxAgeMs <= 0)
        return false;
    const time = Date.parse(timestamp);
    return Number.isFinite(time) && time <= now + 5_000 && now - time <= maxAgeMs;
}
export function ngasTargetInput(telemetry, basket, now = Date.now()) {
    const empty = { strategyId: 'ngas-all-year-beta', version: 'ngas-telemetry-preview-v1', generatedAt: null, expiresAt: null, weights: null, reason: 'Current NGAS inference is unavailable.' };
    const intent = telemetry?.strategy?.intent, inference = telemetry?.strategy?.inference;
    const age = Math.min(900, telemetry?.staleAfterSeconds ?? 900) * 1000;
    if (!telemetry || telemetry.stale === true || !fresh(telemetry.sourceGeneratedAt, now, age))
        return { ...empty, reason: 'Account source is missing or stale.' };
    if (telemetry.execution?.state === 'blocked')
        return { ...empty, reason: 'The NGAS runtime reports blocked execution.' };
    if (intent?.strategyId !== empty.strategyId || inference?.strategyId !== empty.strategyId || !fresh(intent.generatedAt, now, 86_400_000) || !fresh(telemetry.execution?.lastInferenceAt, now, 86_400_000) || inference?.validated !== true || inference?.liveForecastAppliedToTarget !== true)
        return empty;
    const gas = intent.gasPosition, index = intent.indexFraction, cash = intent.cashFraction;
    const currentDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
    if (intent.targetDate !== currentDate || inference.target?.targetDate !== currentDate || !fresh(inference.generatedAt, now, 86_400_000)
        || ['gasPosition', 'indexFraction', 'cashFraction'].some(key => !finite(inference.target?.[key]) || Math.abs(inference.target[key] - intent[key]) > 0.000001))
        return { ...empty, reason: 'Current NGAS intent and inference do not agree on this trading session.' };
    if (!finite(gas) || Math.abs(gas) > 1 || !finite(index) || index < 0 || index > 1 || !finite(cash) || cash < 0 || cash > 1 || Math.abs(Math.abs(gas) + index + cash - 1) > 0.001)
        return { ...empty, reason: 'Current NGAS target fractions are invalid.' };
    if (Object.keys(basket).sort().join(',') !== 'QQQM,VOO' || Object.values(basket).some(v => !finite(v) || v <= 0) || Math.abs(Object.values(basket).reduce((a, b) => a + b, 0) - 1) > 0.000001)
        return { ...empty, reason: 'Reviewed index basket is unavailable.' };
    // This is an indicative target, never a broker executable handoff or promotion claim.
    return { ...empty, generatedAt: intent.generatedAt, expiresAt: new Date(Date.parse(intent.generatedAt) + 86_400_000).toISOString(), weights: { UNG: gas, VOO: index * basket.VOO, QQQM: index * basket.QQQM }, reason: 'Current NGAS target, scaled to the proposed sleeve budget.' };
}
export function targetInputReady(input, now) {
    if (!input?.weights || !fresh(input.generatedAt, now, 86_400_000) || Date.parse(input.generatedAt) > now || !input.expiresAt || !Number.isFinite(Date.parse(input.expiresAt)) || Date.parse(input.expiresAt) <= now || Date.parse(input.expiresAt) <= Date.parse(input.generatedAt) || Date.parse(input.expiresAt) - Date.parse(input.generatedAt) > 86_400_000)
        return false;
    const weights = Object.entries(input.weights);
    return weights.length > 0 && weights.every(([symbol, weight]) => portfolioSymbols.includes(symbol) && finite(weight) && Math.abs(weight) <= 3) && weights.reduce((sum, [, v]) => sum + Math.abs(v), 0) <= 3 + 1e-9;
}
export function planPortfolio(config, strategies, inputs, telemetry, now = Date.now()) {
    config = validatePortfolio(config, strategies);
    const reasons = [];
    const sleeves = config.allocations.map(a => {
        const name = strategies.find(s => s.id === a.strategyId).name;
        const input = inputs.find(i => i.strategyId === a.strategyId);
        const status = config.paused || !a.enabled ? 'paused' : a.capitalUsd === 0 || a.riskScale === 0 || a.maxGrossPct === 0 ? 'unfunded' : targetInputReady(input, now) ? 'ready' : 'unavailable';
        const targets = {};
        if (status === 'ready') {
            const weights = input.weights, gross = Object.values(weights).reduce((sum, v) => sum + Math.abs(v), 0);
            const scale = gross === 0 ? 0 : Math.min(a.riskScale, a.maxGrossPct / 100 / gross);
            for (const [symbol, weight] of Object.entries(weights))
                targets[symbol] = a.capitalUsd * weight * scale;
        }
        if (status === 'unavailable')
            reasons.push(`${name}: a fresh reviewed target adapter is required.`);
        return { ...a, name, status, reason: status === 'paused' ? 'Excluded from the proposed targets; existing broker positions remain unchanged.' : status === 'unfunded' ? 'No proposed exposure.' : input?.reason ?? 'No connected current target adapter.', targets, grossUsd: 0 };
    });
    const sleeveGross = (symbol) => sleeves.reduce((sum, s) => sum + Math.abs(s.targets[symbol] ?? 0), 0);
    const grossBefore = portfolioSymbols.reduce((sum, symbol) => sum + sleeveGross(symbol), 0);
    const longBefore = sleeves.reduce((sum, s) => sum + Object.values(s.targets).reduce((total, v) => total + Math.max(0, v), 0), 0);
    let scale = Math.min(1, grossBefore === 0 ? 1 : config.capitalUsd * config.limits.maxGrossPct / 100 / grossBefore, longBefore === 0 ? 1 : config.capitalUsd * (1 - config.limits.cashReservePct / 100) / longBefore);
    for (const symbol of portfolioSymbols)
        if (sleeveGross(symbol) > 0)
            scale = Math.min(scale, config.capitalUsd * config.limits.maxSymbolPct / 100 / sleeveGross(symbol));
    // Truncate exposure to cents so rounding cannot cross a hard cap.
    for (const sleeve of sleeves) {
        for (const symbol of Object.keys(sleeve.targets))
            sleeve.targets[symbol] = Math.trunc(sleeve.targets[symbol] * scale * 100) / 100;
        sleeve.grossUsd = money(Object.values(sleeve.targets).reduce((sum, v) => sum + Math.abs(v), 0));
    }
    const sourceFresh = telemetry && telemetry.stale !== true && fresh(telemetry.sourceGeneratedAt, now, Math.min(900, telemetry.staleAfterSeconds ?? 900) * 1000);
    const accountFresh = Boolean(sourceFresh && telemetry?.brokerConnected && finite(telemetry.account?.equityUsd) && telemetry.account.equityUsd > 0 && telemetry.account.status === 'ACTIVE');
    const equity = accountFresh ? telemetry.account.equityUsd : null;
    if (!accountFresh)
        reasons.push('Fresh active broker account telemetry is required for a rebalance preview.');
    if (telemetry?.mode !== 'paper')
        reasons.push('This portfolio workspace is bound to paper evaluation; live authorization is separate.');
    if (equity !== null && config.capitalUsd > equity)
        reasons.push('Portfolio capital exceeds current account equity.');
    if (telemetry?.risk?.killSwitchEngaged !== false)
        reasons.push('Operator state is missing or the kill switch is engaged.');
    if (telemetry?.risk?.blockedReasons?.length)
        reasons.push('The runtime reports failed risk or readiness gates.');
    const dayLoss = telemetry?.account?.dayPnlPct, drawdown = telemetry?.account?.trailingDrawdownPct;
    if (!finite(dayLoss) || !finite(drawdown))
        reasons.push('Daily loss and trailing drawdown observations are required.');
    else {
        if (dayLoss <= -config.limits.maxDailyLossPct)
            reasons.push('Daily loss stop reached.');
        if (Math.abs(drawdown) >= config.limits.maxDrawdownPct)
            reasons.push('Trailing drawdown stop reached.');
    }
    if (!telemetry?.marketClock?.isOpen || !fresh(telemetry.marketClock.timestamp, now, 30_000))
        reasons.push('A fresh open market clock is required.');
    if (!Array.isArray(telemetry?.openOrders) || telemetry.openOrders.length)
        reasons.push('Open orders are unknown or pending; the preview cannot assume fills.');
    const current = {}, positionSymbols = new Set();
    let positionsKnown = accountFresh && Array.isArray(telemetry?.positions);
    for (const position of telemetry?.positions ?? []) {
        if (!portfolioSymbols.includes(position.symbol) || !finite(position.marketValueUsd) || positionSymbols.has(position.symbol)) {
            positionsKnown = false;
            continue;
        }
        positionSymbols.add(position.symbol);
        current[position.symbol] = position.marketValueUsd;
    }
    if (!positionsKnown)
        reasons.push('Account positions are incomplete or contain instruments outside the reviewed portfolio contract.');
    const targets = portfolioSymbols.map(symbol => {
        const targetUsd = money(sleeves.reduce((sum, s) => sum + (s.targets[symbol] ?? 0), 0));
        const currentUsd = positionsKnown ? current[symbol] ?? 0 : null;
        return { symbol, targetUsd, currentUsd, deltaUsd: currentUsd === null ? null : money(targetUsd - currentUsd), sleeveGrossUsd: money(sleeveGross(symbol)) };
    });
    if (sleeves.some(s => Object.values(s.targets).some(value => value < 0)) && telemetry?.account?.shortingEnabled !== true)
        reasons.push('The proposed targets require a short-capable account.');
    const turnoverUsd = positionsKnown ? money(targets.reduce((sum, t) => sum + Math.abs(t.deltaUsd), 0)) : null;
    if (turnoverUsd !== null && turnoverUsd > config.capitalUsd * config.limits.maxTurnoverPct / 100)
        reasons.push('Proposed rebalance exceeds the turnover cap.');
    const blocked = reasons.length > 0 || config.paused;
    // Never present a partial target set as an executable rebalance or fabricate exits when an input is unavailable.
    if (blocked)
        for (const target of targets)
            target.deltaUsd = null;
    const netUsd = money(targets.reduce((sum, t) => sum + t.targetUsd, 0));
    return { generatedAt: new Date(now).toISOString(), mode: 'target-preview', ordersEnabled: false, status: config.paused ? 'paused' : blocked ? 'blocked' : 'ready', reasons, sleeves, targets,
        allocatedUsd: money(config.allocations.reduce((sum, a) => sum + a.capitalUsd, 0)), participatingUsd: money(sleeves.filter(s => s.status === 'ready').reduce((sum, s) => sum + s.capitalUsd, 0)),
        grossUsd: money(sleeves.reduce((sum, s) => sum + s.grossUsd, 0)), netUsd, modeledCashUsd: money(config.capitalUsd - netUsd), riskScaleApplied: scale, turnoverUsd: blocked ? null : turnoverUsd, accountEquityUsd: equity };
}

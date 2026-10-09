"""Source-independent leveraged controls, trend tiers and volatility budgets."""
import numpy as np
import pandas as pd
SYMBOLS=['SPY','QQQ','SHY','TQQQ','UPRO','QLD']
def configs():
    specs=[
      ('leverage_allocation','fixed_tech_leverage_mix',[{'fraction':x} for x in [.25,.5,.75]],'Monthly fixed {fraction} TQQQ and remaining QQQ. Static allocation control; no timing edge.', 'monthly',True),
      ('leverage_allocation','leveraged_risk_balance',[{'n':x} for x in [21,63,126]],'Weekly inverse {n}-session actual fund-return volatility weights between TQQQ and UPRO, fully invested; no trend gate.','weekly',False),
      ('leverage_allocation','relative_leverage_sleeves',[{'n':x} for x in [63,126,252]],'Monthly half QQQ/half SPY; substitute TQQQ for QQQ half when QQQ {n}-session return is positive and exceeds SPY; substitute UPRO for SPY half under the reciprocal condition.','monthly',False),
      ('underlying_trend','single_underlying_trend',[{'n':x} for x in [63,126,200]],'Weekly TQQQ when QQQ exceeds its {n}-session total-NAV SMA, otherwise SHY.','weekly',False),
      ('underlying_trend','two_underlying_trend_sleeves',[{'n':x} for x in [63,126,200]],'Weekly half TQQQ if QQQ above {n}-session SMA and half UPRO if SPY above {n}-session SMA; each failed sleeve SHY.','weekly',False),
      ('underlying_trend','tech_trend_tiers',[{'fast':x} for x in [21,63,126]],'Weekly QQQ above both 200-session and {fast}-session SMA means TQQQ; only above200 means QLD; only abovefast means QQQ; neither SHY. Full mean history required.','weekly',False),
      ('leveraged_volatility','fund_vol_target',[{'risk':x} for x in [.35,.5,.65]],'Weekly TQQQ weight=min(1,{risk}/trailing63-session annual fund volatility); rest SHY.','weekly',False),
      ('leveraged_volatility','underlying_vol_leverage_budget',[{'risk':x} for x in [.30,.45,.60]],'Weekly nominal Nasdaq daily contract budget=min(3,{risk}/QQQ trailing63-session annual volatility). Below1, blend QQQ/SHY; above1 blend actual QQQ/TQQQ. Actual fund paths, no synthetic3x index return.','weekly',False)]
    out=[]
    for family,design,variants,description,schedule,control in specs:
        for i,p in enumerate(variants,1):out.append(dict(id=f'lev_core_{design}_v{i}',family=family,design=design,variant=i,params=p,schedule=schedule,description=description.format(**p),static_control=control))
    return out
def targets(c,nav):
    if list(nav.columns)!=SYMBOLS:raise ValueError('Exact frozen six-asset order required')
    w=pd.DataFrame(0.,index=nav.index,columns=nav.columns);p=c['params'];d=c['design'];r=nav.pct_change(fill_method=None)
    sma=lambda s,n:nav[s].rolling(n,min_periods=n).mean()
    vol=lambda s,n:r[s].rolling(n,min_periods=n).std(ddof=1)*np.sqrt(252)
    if d=='fixed_tech_leverage_mix':w['TQQQ']=p['fraction'];w['QQQ']=1-p['fraction']
    elif d=='leveraged_risk_balance':
        sigma=vol(['TQQQ','UPRO'],p['n']).where(lambda x:x>1e-12);v=1/sigma
        v=v.where(sigma.notna().all(axis=1),0).fillna(0);w[['TQQQ','UPRO']]=v.div(v.sum(axis=1).replace(0,np.nan),axis=0).fillna(0)
    elif d=='relative_leverage_sleeves':
        m=nav[['QQQ','SPY']].pct_change(p['n'],fill_method=None);valid=m.notna().all(axis=1)
        q=(valid&m.QQQ.gt(0)&m.QQQ.gt(m.SPY)).astype(float);s=(valid&m.SPY.gt(0)&m.SPY.gt(m.QQQ)).astype(float)
        w['TQQQ']=q*.5;w['UPRO']=s*.5;w['QQQ']=valid.astype(float)*.5-q*.5;w['SPY']=valid.astype(float)*.5-s*.5
    elif d=='single_underlying_trend':w['TQQQ']=nav.QQQ.gt(sma('QQQ',p['n'])).astype(float)
    elif d=='two_underlying_trend_sleeves':
        w['TQQQ']=nav.QQQ.gt(sma('QQQ',p['n'])).astype(float)*.5;w['UPRO']=nav.SPY.gt(sma('SPY',p['n'])).astype(float)*.5
    elif d=='tech_trend_tiers':
        slow=sma('QQQ',200);fast=sma('QQQ',p['fast']);valid=slow.notna()&fast.notna();a=nav.QQQ.gt(slow);b=nav.QQQ.gt(fast)
        w['TQQQ']=(valid&a&b).astype(float);w['QLD']=(valid&a&~b).astype(float);w['QQQ']=(valid&~a&b).astype(float)
    elif d=='fund_vol_target':w['TQQQ']=(p['risk']/vol('TQQQ',63).where(lambda x:x>1e-12)).clip(0,1).fillna(0)
    elif d=='underlying_vol_leverage_budget':
        budget=(p['risk']/vol('QQQ',63).where(lambda x:x>1e-12)).clip(0,3).fillna(0)
        w['TQQQ']=((budget-1)/2).clip(0,1);w['QQQ']=budget.where(budget<1,(3-budget)/2)
    else:raise ValueError(d)
    w['SHY']=1-w.sum(axis=1)
    if not np.isfinite(w.to_numpy()).all() or (w<-1e-12).any().any() or (w.sum(axis=1)>1+1e-12).any():raise ValueError('Funded nonnegative targets required')
    return w.clip(lower=0)

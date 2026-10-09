"""Daily close marks, prior-close signals, next-open funded trades with exact costs."""
import numpy as np
import pandas as pd

def schedule_flags(index,schedule):
    if schedule not in ['daily','weekly','monthly','once']:raise ValueError('Unknown schedule')
    if schedule=='daily':return np.ones(len(index),dtype=bool)
    if schedule=='once':
        flag=np.zeros(len(index),dtype=bool);flag[0]=True;return flag
    period=index.to_period('W-FRI' if schedule=='weekly' else 'M')
    flag=np.zeros(len(index),dtype=bool)
    flag[:-1]=period[:-1]!=period[1:]
    # Final row has no execution bar in loaded data; no incomplete-period assumption.
    return flag

def execution_plan(target,schedule,delay=0):
    if not isinstance(delay,int) or delay<0:raise ValueError('Nonnegative integer delay required')
    flag=schedule_flags(target.index,schedule)
    known=target.where(pd.Series(flag,index=target.index),axis=0).ffill().fillna(0).shift(1+delay).fillna(0)
    rebalance=pd.Series(flag,index=target.index).shift(1+delay,fill_value=False).astype(bool)
    return known,rebalance

def simulate(opens,closes,targets,schedule,start,end,cost_multiplier=1,delay=0,capital=100000):
    if not np.isfinite(cost_multiplier) or cost_multiplier<0 or not np.isfinite(capital) or capital<=0:raise ValueError('Invalid cost/capital')
    assert opens.index.equals(closes.index) and opens.columns.equals(closes.columns)
    assert targets.index.equals(closes.index) and targets.columns.equals(closes.columns)
    x=targets.to_numpy(float)
    if not np.isfinite(x).all() or x.min()<-1e-9 or x.sum(axis=1).max()>1+1e-9:raise ValueError('Invalid funded long-only targets')
    target,rebalance=execution_plan(targets,schedule,delay)
    selected=np.flatnonzero((opens.index>=start)&(opens.index<=end))
    if len(selected)<2:raise ValueError('Too few sessions')
    op=opens.to_numpy(float);cl=closes.to_numpy(float);tw=target.to_numpy(float);rb=rebalance.to_numpy()
    if not np.isfinite(op[selected]).all() or not np.isfinite(cl[selected]).all() or (op[selected]<=0).any() or (cl[selected]<=0).any():raise ValueError('Invalid execution prices')
    costs=np.array([.001 if s in ['TQQQ','UPRO'] else .0005 for s in closes.columns])*cost_multiplier
    holdings=np.zeros(op.shape[1]);cash=float(capital);previous=capital
    equity=[];turnover=[];expenses=[];realized=[];days=[]
    for j,i in enumerate(selected):
        if j:holdings*=op[i]/cl[selected[j-1]]
        traded=0.;fee=0.
        if j==0 or rb[i]:
            before=holdings.sum()+cash;nav=before
            for _ in range(30):
                new=before-np.dot(costs,np.abs(tw[i]*nav-holdings))
                if abs(new-nav)<1e-9:break
                nav=new
            desired=tw[i]*new;delta=desired-holdings
            fee=float(np.dot(costs,np.abs(delta)));traded=float(np.abs(delta).sum()/before)
            holdings=desired;cash=before-fee-holdings.sum()
            if cash<-1e-6:raise AssertionError('Borrowing')
        holdings*=cl[i]/op[i]
        value=float(holdings.sum()+cash)
        realized.append(holdings/value)
        if j==len(selected)-1:
            exit_fee=float(np.dot(costs,holdings));fee+=exit_fee;traded+=float(holdings.sum()/value)
            value-=exit_fee;cash=value;holdings*=0
        equity.append(value);expenses.append(fee);turnover.append(traded);days.append(opens.index[i])
    eq=pd.Series(equity,index=pd.DatetimeIndex(days),name='equity')
    returns=eq.pct_change(fill_method=None);returns.iloc[0]=eq.iloc[0]/capital-1
    return {'equity':eq,'returns':returns,'turnover':pd.Series(turnover,index=eq.index),'fees':pd.Series(expenses,index=eq.index),
            'weights':pd.DataFrame(realized,index=eq.index,columns=opens.columns),'capital':capital}

def metrics(result):
    eq=result['equity'];r=result['returns'];initial=result['capital']
    years=(eq.index[-1]-eq.index[0]).days/365.25
    wealth=np.r_[initial,eq.to_numpy()]
    draw=wealth/np.maximum.accumulate(wealth)-1
    sd=r.std(ddof=1)
    weights=result['weights'];stock=[s for s in ['AAPL','MSFT','AMZN','GOOGL','NVDA','JPM','XOM','JNJ','WMT'] if s in weights]
    return dict(first=str(eq.index[0].date()),last=str(eq.index[-1].date()),sessions=len(eq),years=years,
      net_return=eq.iloc[-1]/initial-1,cagr=(eq.iloc[-1]/initial)**(1/years)-1,max_drawdown=float(draw.min()),
      sharpe=float(np.sqrt(252)*r.mean()/sd) if sd>0 else 0,volatility=float(sd*np.sqrt(252)),
      annual_turnover=float(result['turnover'].sum()/years),fees_dollars=float(result['fees'].sum()),
      mean_funded_exposure=float(weights.sum(axis=1).mean()),mean_stock_exposure=float(weights[stock].sum(axis=1).mean()),
      mean_top_weight=float(weights.max(axis=1).mean()),max_top_weight=float(weights.max(axis=1).max()),
      mean_hhi=float((weights**2).sum(axis=1).mean()),trade_day_fraction=float((result['turnover']>1e-8).mean()),
      mean_levered_exposure=float(weights[['TQQQ','UPRO']].sum(axis=1).mean()) if 'TQQQ' in weights else 0)

def annual_returns(r):return (1+r).groupby(r.index.year).prod()-1

def exposure_benchmark(result_dev,config,close):
    family=config['family']
    if family=='leveraged_etf':
        means=result_dev['weights'][['UPRO','TQQQ']].mean();w=pd.DataFrame(0.,index=close.index,columns=close.columns)
        w[['UPRO','TQQQ']]=np.tile(means.to_numpy(),(len(close),1));return w
    asset='QQQ' if family in ['concentrated_stocks','volatility_scaling'] or 'QQQ' in config.get('params',{}).values() else 'SPY'
    risky=[s for s in close.columns if s not in ['SHY','IEF','TLT','GLD','DBC']]
    amount=float(result_dev['weights'][risky].sum(axis=1).mean())
    w=pd.DataFrame(0.,index=close.index,columns=close.columns);w[asset]=amount;return w

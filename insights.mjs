export const RESEARCH_SECTIONS=[
  'Business snapshot','Financial snapshot','Trajectory','Balance sheet',
  'Cash quality','Narrative vs. numbers','Guidance','Bull vs. bear'
];

export function extractEvidence(text,pattern){
  const lines=text.split(/(?<=[.!?])\s+(?=[A-Z“])|\s*…\s*/);
  const match=lines.find(line=>line.length>=50&&line.length<=400&&pattern.test(line)&&!/forward.looking statement|table of contents|safe harbor/i.test(line));
  if(!match)return null;
  const words=match.trim().split(/\s+/);
  return words.slice(0,24).join(' ')+(words.length>24?'…':'');
}
export function reportInsights(docs,annual,results,guidance){
  const find=type=>docs.findIndex(s=>s.type===type&&s.text);
  const ar=find('Annual report'), call=find('Earnings call');
  const excerpt=(i,pattern)=>{
    const text=extractEvidence(docs[i]?.text??'',pattern);
    return text?{text,source:i+1}:null;
  };
  const latest=annual?.years[0], ratios=annual?.ratios??{};
  const growth=ratios.revenueGrowth, margin=ratios.netMargin;
  const outlook=excerpt(call,/guidance|target(?:s|ing)?|expect.*(?:margin|growth|capital expenditure|capex)/i);
  const risk=excerpt(ar,/risk|uncertain|competition|exposure/i);
  const fmt=value=>Number(value.toFixed(1));
  const sales=results?.quarterly?.rows.find(r=>r.label==='Revenue');
  const pat=results?.quarterly?.rows.find(r=>r.label==='Profit after tax');
  const recent=results?.periods?.[0], balance=recent?.balance, cashFlow=recent?.cashFlow;
  const crore=value=>'₹'+fmt(value/10000000).toLocaleString('en-IN')+' crore';
  const quarterNote=Number.isFinite(sales?.value)?'Quarter ended '+results.quarterly.period+': revenue '+crore(sales.value)+(Number.isFinite(pat?.value)?', profit after tax '+crore(pat.value)+(sales.value>0?', PAT margin '+fmt(100*pat.value/sales.value)+'%':''):'')+'.'+(Number.isFinite(sales.yoy)?' Revenue changed '+fmt(sales.yoy)+'% year over year.':''):null;
  const borrowing=Number.isFinite(balance?.current)&&Number.isFinite(balance?.noncurrent)?balance.current+balance.noncurrent:null;
  const workingCapital=Number.isFinite(balance?.currentAssets)&&Number.isFinite(balance?.currentLiabilities)?balance.currentAssets-balance.currentLiabilities:null;
  const reportedBalance=Number.isFinite(balance?.equity)?'As of '+recent.end+', equity was '+crore(balance.equity)+(Number.isFinite(borrowing)?' and tagged borrowings were '+crore(borrowing)+(balance.equity>0?' ('+fmt(borrowing/balance.equity)+'× equity)':''):'')+(Number.isFinite(workingCapital)?'. Net working capital was '+crore(workingCapital):'')+'.':null;
  const reportedCash=Number.isFinite(cashFlow?.amount)?'Reported operating cash flow was '+crore(cashFlow.amount)+' from '+cashFlow.start+' through '+recent.end+'.':null;
  const days=(end,start)=>(Date.parse(end)-Date.parse(start))/86400000;
  const comparableCash=reportedCash?results.periods.find(p=>p.cashFlow&&Number.isFinite(p.cashFlow.amount)&&
    Math.abs(days(recent.end,p.end)-365)<=15&&Math.abs(days(recent.end,cashFlow.start)-days(p.end,p.cashFlow.start))<=7):null;
  const cashTrend=comparableCash?' The comparable prior-year period reported '+crore(comparableCash.cashFlow.amount)+'.':'';
  const cashRatio=Number.isFinite(ratios.cashConversion)?' For the year ended '+latest.end+', operating cash flow was '+fmt(ratios.cashConversion)+'× reported profit.':'';
  const annualFacts=annual?.years.filter(y=>Number.isFinite(y.revenue))??[];
  const first=annualFacts.at(-1), last=annualFacts[0];
  const annualMarginChange=first?.revenue>0&&last?.revenue>0&&Number.isFinite(first.income)&&Number.isFinite(last.income)?fmt(100*(last.income/last.revenue-first.income/first.revenue)):null;
  const longerTrend=annualFacts.length>=2&&first.revenue>0?'From '+first.end+' to '+last.end+', annual revenue changed '+fmt(100*(last.revenue/first.revenue-1))+'%'+(annualMarginChange!==null?' and PAT margin changed '+annualMarginChange+' percentage points':'')+'.':null;
  const directionalGrowth=Number.isFinite(growth)?growth:sales?.yoy;
  const bull=Number.isFinite(directionalGrowth)&&directionalGrowth>0?'Comparable reported revenue rose '+fmt(directionalGrowth)+'%.':null;
  const bear=Number.isFinite(directionalGrowth)&&directionalGrowth<0?'Comparable reported revenue fell '+fmt(Math.abs(directionalGrowth))+'%.':null;
  return [
    {title:'Business snapshot',evidence:excerpt(ar,/segment|services|products|customers|business model/i),additionalEvidence:excerpt(ar,/segment revenue|revenue mix|of total (?:revenue|sales)|of (?:our|its) revenue/i)},
    {title:'Financial snapshot',note:quarterNote??(Number.isFinite(margin)?'Reported net margin was '+fmt(margin)+'% for the year ending '+latest.end+'.':null)},
    {title:'Trajectory',note:longerTrend??(Number.isFinite(sales?.yoy)?'Latest quarterly revenue changed '+fmt(sales.yoy)+'% against the same quarter last year. Comparable annual history was unavailable.':null)},
    {title:'Balance sheet',note:reportedBalance??(Number.isFinite(ratios.debtToEquity)?'Reported borrowings were '+fmt(ratios.debtToEquity)+'× equity.':null),evidence:excerpt(ar,/working.capital cycle|days sales outstanding|cash conversion cycle|funding structure|debt maturit|financing arrangement/i)},
    {title:'Cash quality',note:((reportedCash??'')+cashTrend+cashRatio).trim()||null,evidence:excerpt(ar,/operating cash flow|cash from operations|free cash flow/i)},
    {title:'Narrative vs. numbers',note:guidance?.summary??(outlook&&latest?'Management’s remarks and the annual figures may cover different periods. A guidance-versus-actual comparison needs a matched metric and period.':'Matching guidance and reported results could not be verified from the available sources.')},
    {title:'Guidance',evidence:outlook,additionalEvidence:excerpt(call,/(?:capital expenditure|capex).*(?:expect|target|range|guidance)|(?:expect|target|guidance).*(?:capital expenditure|capex)/i)},
    {title:'Bull vs. bear',bull,bear,evidence:risk}
  ];
}
export function quarterlyComparison(periods){
  const latest=periods[0];
  if(!latest)return null;
  const distance=(a,b)=>(Date.parse(a)-Date.parse(b))/86400000;
  const previous=periods.find(p=>distance(latest.end,p.end)>=75&&distance(latest.end,p.end)<=105);
  const priorYear=periods.find(p=>distance(latest.end,p.end)>=350&&distance(latest.end,p.end)<=380);
  const change=(current,prior)=>Number.isFinite(current)&&Number.isFinite(prior)&&prior>0?100*(current/prior-1):null;
  const ebitda=Number.isFinite(latest.ebitda)?['ebitda','EBITDA']:['ebitdaProxy','EBITDA proxy'];
  return {period:latest.end,previous:previous?.end,priorYear:priorYear?.end,rows:[
    ['revenue','Revenue'],ebitda,['pbt','Profit before tax'],['income','Profit after tax']
  ].map(([key,label])=>({label,value:latest[key]??null,qoq:change(latest[key],previous?.[key]),yoy:change(latest[key],priorYear?.[key])}))};
}

export function parseNseQuarterly(xml){
  const periods=new Map();
  const balances=new Map(), cashFlows=new Map();
  const tag=(text,name)=>new RegExp('<(?:[\\w.-]+:)?'+name+'\\b[^>]*>([^<]+)</(?:[\\w.-]+:)?'+name+'>','i').exec(text)?.[1].trim();
  const attr=(text,name)=>new RegExp('\\b'+name+'=["\']([^"\']+)["\']','i').exec(text)?.[1];
  const units=new Set();
  for(const [,attributes,body] of xml.matchAll(/<(?:[\w.-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?unit>/g)){
    if(/(?:^|:)INR$/i.test(tag(body,'measure')??''))units.add(attr(attributes,'id'));
  }
  const contexts=new Map();
  for(const [,attributes,body] of xml.matchAll(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g)){
    if(/<(?:[\w.-]+:)?(?:scenario|segment)\b/.test(body))continue;
    const instant=tag(body,'instant');
    if(instant){contexts.set(attr(attributes,'id'),{end:instant});continue;}
    const start=tag(body,'startDate'), end=tag(body,'endDate');
    const duration=(Date.parse(end)-Date.parse(start))/86400000;
    if(duration>=75&&duration<=380)contexts.set(attr(attributes,'id'),{start,end,duration});
  }
  const fields={
    RevenueFromOperations:'revenue',RevenueFromOperationsOtherThanFinanceCompany:'revenue',
    ProfitBeforeTax:'pbt',ProfitLossForPeriod:'income',FinanceCosts:'financeCosts',
    DepreciationDepletionAndAmortisationExpense:'depreciation',
    EarningsBeforeInterestTaxDepreciationAndAmortisation:'ebitda'
  };
  const balanceFields={Equity:'equity',BorrowingsCurrent:'current',BorrowingsNoncurrent:'noncurrent',CurrentAssets:'currentAssets',CurrentLiabilities:'currentLiabilities'};
  for(const [,field,attributes,value] of xml.matchAll(/<(?:[\w.-]+:)?([A-Za-z]\w*)\b([^>]*\bcontextRef\s*=[^>]*)>\s*(-?\d+(?:\.\d+)?)\s*<\/(?:[\w.-]+:)?\1>/g)){
    const context=contexts.get(attr(attributes,'contextRef'));
    if(!context||!units.has(attr(attributes,'unitRef')))continue;
    const {start,end,duration}=context;
    const numeric=Number(value);
    if(!start&&balanceFields[field]){
      const balance=balances.get(end)??{};
      const key=balanceFields[field];
      balance[key]=key in balance&&balance[key]!==numeric?null:numeric;
      balances.set(end,balance);
    }
    if(start&&field==='CashFlowsFromUsedInOperatingActivities'){
      const prior=cashFlows.get(end);
      if(!prior||start<prior.start)cashFlows.set(end,{start,amount:numeric});
      else if(start===prior.start&&prior.amount!==numeric)prior.amount=null;
    }
    const key=fields[field];
    if(!key||duration<75||duration>105||!start)continue;
    const period=periods.get(end)??{end};
    if(key in period&&period[key]!==numeric)period[key]=null;
    else period[key]=numeric;
    periods.set(end,period);
  }
  return [...periods.values()].filter(period=>Number.isFinite(period.revenue)).map(period=>{
    const {pbt,financeCosts,depreciation}=period;
    return {...period,balance:balances.get(period.end),cashFlow:cashFlows.get(period.end),ebitdaProxy:[pbt,financeCosts,depreciation].every(Number.isFinite)?pbt+financeCosts+depreciation:null};
  }).sort((a,b)=>b.end.localeCompare(a.end));
}

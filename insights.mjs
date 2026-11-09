export function extractEvidence(text,pattern){
  const lines=text.split(/(?<=[.!?])\s+(?=[A-Z“])|\s*…\s*/);
  const match=lines.find(line=>line.length>=50&&line.length<=400&&pattern.test(line)&&!/forward.looking statement|table of contents|safe harbor/i.test(line));
  if(!match)return null;
  const words=match.trim().split(/\s+/);
  return words.slice(0,24).join(' ')+(words.length>24?'…':'');
}
export function reportInsights(docs,annual,results){
  const find=type=>docs.findIndex(s=>s.type===type&&s.text);
  const ar=find('Annual report'), call=find('Earnings call');
  const excerpt=(i,pattern)=>{
    const text=extractEvidence(docs[i]?.text??'',pattern);
    return text?{text,source:i+1}:null;
  };
  const latest=annual?.years[0], ratios=annual?.ratios??{};
  const growth=ratios.revenueGrowth, margin=ratios.netMargin;
  const outlook=excerpt(call,/expect|outlook|guidance|anticipate|projected/i);
  const risk=excerpt(ar,/risk|uncertain|competition|exposure/i);
  const fmt=value=>Number(value.toFixed(1));
  const sales=results?.quarterly.rows.find(r=>r.label==='Revenue');
  const quarterNote=Number.isFinite(sales?.value)?'Reported quarterly revenue was ₹'+fmt(sales.value/10000000).toLocaleString('en-IN')+' crore for the period ending '+results.quarterly.period+'.'+(Number.isFinite(sales.yoy)?' Year over year: '+fmt(sales.yoy)+'%.':''):null;
  return [
    {title:'Business snapshot',evidence:excerpt(ar,/segment|services|products|customers|business model/i)},
    {title:'Financial snapshot',note:quarterNote??(Number.isFinite(margin)?'Reported net margin was '+fmt(margin)+'% for the year ending '+latest.end+'.':null)},
    {title:'Multi-year trajectory',note:Number.isFinite(growth)?'Annual revenue '+(growth<0?'fell ':'grew ')+fmt(Math.abs(growth))+'% versus the prior comparable year.':null},
    {title:'Balance sheet',note:Number.isFinite(ratios.debtToEquity)?'Reported borrowings were '+fmt(ratios.debtToEquity)+'× equity.':null,evidence:excerpt(ar,/borrowings|liquidity|working capital|debt/i)},
    {title:'Cash quality',note:Number.isFinite(ratios.cashConversion)?'Operating cash flow was '+fmt(ratios.cashConversion)+'× reported profit.':null,evidence:excerpt(ar,/operating cash flow|cash from operations|free cash flow/i)},
    {title:'Narrative vs. numbers',note:outlook&&latest?'Management’s remarks and the annual figures may cover different periods. A guidance-versus-actual comparison needs a matched metric and quarter.':'Matching guidance and reported results could not be verified from the available sources.'},
    {title:'Management outlook',evidence:outlook},
    {title:'Bull and bear evidence',note:Number.isFinite(growth)?'Reported revenue '+(growth<0?'decline is a cautionary signal.':'growth is one piece of supportive evidence.'):null,evidence:risk}
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
  const tag=(text,name)=>new RegExp('<(?:[\\w.-]+:)?'+name+'\\b[^>]*>([^<]+)</(?:[\\w.-]+:)?'+name+'>','i').exec(text)?.[1].trim();
  const attr=(text,name)=>new RegExp('\\b'+name+'=["\']([^"\']+)["\']','i').exec(text)?.[1];
  const units=new Set();
  for(const [,attributes,body] of xml.matchAll(/<(?:[\w.-]+:)?unit\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?unit>/g)){
    if(/(?:^|:)INR$/i.test(tag(body,'measure')??''))units.add(attr(attributes,'id'));
  }
  const contexts=new Map();
  for(const [,attributes,body] of xml.matchAll(/<(?:[\w.-]+:)?context\b([^>]*)>([\s\S]*?)<\/(?:[\w.-]+:)?context>/g)){
    if(/<(?:[\w.-]+:)?(?:scenario|segment)\b/.test(body))continue;
    const start=tag(body,'startDate'), end=tag(body,'endDate');
    const duration=(Date.parse(end)-Date.parse(start))/86400000;
    if(duration>=75&&duration<=105)contexts.set(attr(attributes,'id'),end);
  }
  const fields={
    RevenueFromOperations:'revenue',RevenueFromOperationsOtherThanFinanceCompany:'revenue',
    ProfitBeforeTax:'pbt',ProfitLossForPeriod:'income',FinanceCosts:'financeCosts',
    DepreciationDepletionAndAmortisationExpense:'depreciation',
    EarningsBeforeInterestTaxDepreciationAndAmortisation:'ebitda'
  };
  for(const [,field,attributes,value] of xml.matchAll(/<(?:[\w.-]+:)?([A-Za-z]\w*)\b([^>]*\bcontextRef\s*=[^>]*)>\s*(-?\d+(?:\.\d+)?)\s*<\/(?:[\w.-]+:)?\1>/g)){
    const key=fields[field], end=contexts.get(attr(attributes,'contextRef'));
    if(!key||!end||!units.has(attr(attributes,'unitRef')))continue;
    const period=periods.get(end)??{end};
    const numeric=Number(value);
    if(key in period&&period[key]!==numeric)period[key]=null;
    else period[key]=numeric;
    periods.set(end,period);
  }
  return [...periods.values()].filter(period=>Number.isFinite(period.revenue)).map(period=>{
    const {pbt,financeCosts,depreciation}=period;
    return {...period,ebitdaProxy:[pbt,financeCosts,depreciation].every(Number.isFinite)?pbt+financeCosts+depreciation:null};
  }).sort((a,b)=>b.end.localeCompare(a.end));
}

const rows = [
['RELIANCE','Reliance Industries','Energy','Large'],['HDFCBANK','HDFC Bank','Financials','Large'],
['ICICIBANK','ICICI Bank','Financials','Large'],['TCS','Tata Consultancy Services','Technology','Large'],
['LT','Larsen & Toubro','Industrials','Large'],['SUNPHARMA','Sun Pharmaceutical','Healthcare','Large'],
['MARUTI','Maruti Suzuki','Automotive','Large'],['HINDUNILVR','Hindustan Unilever','Consumer','Large'],
['TATAPOWER','Tata Power','Utilities','Mid'],['CUMMINSIND','Cummins India','Industrials','Mid'],
['PERSISTENT','Persistent Systems','Technology','Mid'],['FEDERALBNK','Federal Bank','Financials','Mid'],
['APOLLOTYRE','Apollo Tyres','Automotive','Mid'],['GODREJAGRO','Godrej Agrovet','Consumer','Small'],
['SOUTHBANK','South Indian Bank','Financials','Small'],['KIRLOSBROS','Kirloskar Brothers','Industrials','Small'],
['SANDHAR','Sandhar Technologies','Automotive','Small'],['MOREPENLAB','Morepen Laboratories','Healthcare','Small'],
['INFY','Infosys','Technology','Large'],['WIPRO','Wipro','Technology','Large'],
['DRREDDY','Dr. Reddy’s Laboratories','Healthcare','Large'],['HINDALCO','Hindalco Industries','Metals','Large'],
['TATASTEEL','Tata Steel','Metals','Large'],['AXISBANK','Axis Bank','Financials','Large']
];
export const catalog = rows.map(([symbol,name,sector,cap],i)=>({symbol,name,sector,cap,demo:i>=18}));
export const seeded = catalog.filter(s=>!s.demo).map((s,i)=>({symbol:s.symbol,quantity:8+i*3,average:240+i*80}));
export const categories=['Results','M&A','Management','Capital','Legal','Routine'];
export function classify(text) {
  const rules = [
    ['Results',/financial results|quarterly results|earnings|audited results/],
    ['M&A',/acqui[rs]|merger|amalgamation|takeover|divest/],
    ['Management',/change in management|resign|director appointment|appointment.*director|chief executive|management change/],
    ['Capital',/dividend|buyback|fund rais|preferential|stock split|bonus issue/],
    ['Legal',/penalty|litigation|fraud|regulatory action|default/]
  ];
  return rules.find(([, pattern])=>pattern.test(text.toLowerCase()))?.[0] ?? 'Routine';
}
export function metrics(bars) {
  const last=bars.at(-1), previous=bars.at(-2);
  if(!last) return {};
  const returns=(window)=>bars.slice(window).map((b,i)=>100*(b.adjusted/bars[i].adjusted-1));
  const values=Object.fromEntries([21,63,252].map(n=>{
    const series=returns(n);
    const sorted=[...series].sort((a,b)=>a-b);
    const middle=Math.floor(sorted.length/2);
    const median=sorted.length?(sorted[middle]+sorted[Math.floor((sorted.length-1)/2)])/2:null;
    return [n,{latest:series.at(-1)??null,median,observations:series.length}];
  }));
  const prior=bars.slice(-21,-1);
  const mean=prior.length===20 ? prior.reduce((sum,b)=>sum+b.volume,0)/20 : 0;
  return {date:last.date,close:last.close,day:previous?100*(last.adjusted/previous.adjusted-1):null,volume:mean?last.volume/mean:null,returns:values};
}
export function fundamentals(latest,previous){
  const pct=(a,b)=>Number.isFinite(a)&&Number.isFinite(b)&&b>0?100*a/b:null;
  const growth=pct(latest.revenue,previous.revenue);
  return {revenueGrowth:growth===null?null:growth-100,netMargin:pct(latest.income,latest.revenue),returnOnEquity:pct(latest.income,Number.isFinite(latest.equity)&&Number.isFinite(previous.equity)?(latest.equity+previous.equity)/2:null)};
}
export function demoBars(symbol, now=Date.now()) {
  let seed=[...symbol].reduce((n,c)=>(n*31+c.charCodeAt())>>>0,71);
  const random=()=>((seed=(Math.imul(1664525,seed)+1013904223)>>>0)/4294967296);
  let close=120+random()*2600;
  const bars=[];
  for(let i=380;i>=0;i--){
    const date=new Date(now-i*86400000);
    if([0,6].includes(date.getUTCDay())) continue;
    close*=1+(random()-.48)*.045;
    bars.push({date:date.toISOString().slice(0,10),close,adjusted:close,volume:100000+random()*550000});
  }
  const last=bars.at(-1), previous=bars.at(-2);
  if(symbol==='PERSISTENT') Object.assign(last,{close:previous.close*1.061,adjusted:previous.close*1.061});
  if(symbol==='TATAPOWER') last.volume=1500000;
  return bars;
}
export function csvHoldings(csv) {
  const lines=String(csv).replace(/^\uFEFF/,'').trim().split(/\r?\n/).filter(s=>s.trim());
  const fields=line=>line.split(',').map(s=>s.trim().replace(/^"([^"]*)"$/,'$1'));
  if(fields(lines.shift()??'').map(s=>s.toLowerCase()).join(',')!=='symbol,quantity,average_cost') throw Error('Use symbol,quantity,average_cost as the header.');
  if(!lines.length || lines.length>100) throw Error('Import between 1 and 100 holdings.');
  const seen=new Set();
  return lines.map((line,i)=>{
    const cells=fields(line), symbol=cells[0]?.toUpperCase(), quantity=Number(cells[1]), average=Number(cells[2]);
    if(cells.length!==3 || !/^[A-Z0-9&-]{1,24}$/.test(symbol) || !cells[2] || !(quantity>0) || !Number.isFinite(quantity) || !Number.isFinite(average) || average<0 || seen.has(symbol)) throw Error('Invalid or duplicate holding on line '+(i+2));
    seen.add(symbol);
    return {symbol,quantity,average};
  });
}
export const dateIST=(value=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(value);
export function briefingSlot(now,calendar){
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Kolkata',hour:'2-digit',minute:'2-digit',weekday:'short',hourCycle:'h23'}).formatToParts(now).map(p=>[p.type,p.value]));
  const day=dateIST(now), minute=Number(parts.hour)*60+Number(parts.minute);
  if(!calendar || calendar.year!==Number(day.slice(0,4)) || calendar.holidays.includes(day)) return null;
  const special=calendar.special?.[day];
  if(!special&&['Sat','Sun'].includes(parts.weekday)) return null;
  const {pre,post}=special??{pre:535,post:960};
  const slot=minute>=pre&&minute<pre+20?'pre':minute>=post&&minute<post+60?'post':null;
  return slot?{day,slot}:null;
}


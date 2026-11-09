import {createHash} from 'node:crypto';
import {catalog,classify,dateIST,demoBars,metrics,fundamentals} from './data.mjs';
import {extractEvidence,reportInsights,quarterlyComparison,parseNseQuarterly} from './insights.mjs';
import {guidanceScorecard} from './guidance.mjs';
import {DEFAULT_GEMINI_MODEL,geminiPayload,generateGeminiBrief} from './gemini.mjs';
import {parseDailyReport,parseAnnouncementRss} from './exchange.mjs';

const nse='https://www.nseindia.com';
const exchangePage=nse+'/companies-listing/corporate-filings-announcements';
const yahoo='https://query1.finance.yahoo.com/v8/finance/chart/';
const cache=new Map(), inflight=new Map();
async function cached(key, ttl, load, refresh=false) {
  const prior=cache.get(key);
  if(!refresh && prior && prior.expiry>Date.now()) return prior.value;
  if(inflight.has(key)) return inflight.get(key);
  const job=Promise.resolve().then(load).then(value=>{
    if(cache.size>=400) cache.delete(cache.keys().next().value);
    cache.set(key,{value,expiry:Date.now()+ttl});
    return value;
  }).finally(()=>inflight.delete(key));
  inflight.set(key,job);
  return job;
}
async function get(url, headers={}, options={}) {
  const res=await fetch(url,{headers,signal:AbortSignal.timeout(8500),...options});
  if(!res.ok) throw Error('Provider returned HTTP '+res.status);
  return res;
}
const equityDirectory='https://nsearchives.nseindia.com/content/equities/EQUITY_L.csv';
let lastDirectory, directoryRetryAt=0;
export function parseEquityDirectory(csv) {
  const rows=csv.replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>
    [...line.matchAll(/(?:^|,)\s*("(?:[^"]|"")*"|[^,]*)/g)]
      .map(([,cell])=>cell.trim().replace(/^"(.*)"$/,'$1').replaceAll('""','"')));
  const header=rows.shift()??[];
  const symbol=header.indexOf('SYMBOL'), name=header.indexOf('NAME OF COMPANY'), isin=header.indexOf('ISIN NUMBER');
  if([symbol,name,isin].includes(-1)) throw Error('Invalid NSE directory response');
  return [...new Map(rows.filter(row=>/^[A-Z0-9&-]{1,24}$/.test(row[symbol]??'')&&row[name])
    .map(row=>[row[symbol],{symbol:row[symbol],name:row[name],isin:row[isin],exchange:'NSE'}])).values()];
}
async function loadEquityDirectory(){
  let rows, status='live';
  try {
    if(Date.now()<directoryRetryAt) throw Error('NSE directory retry is pending');
    rows=await cached('nse-equities',86400000,async()=>{
      const response=await get(equityDirectory);
      const listed=parseEquityDirectory(await response.text());
      if(!listed.length) throw Error('Empty NSE equity directory');
      lastDirectory=listed;
      return listed;
    });
  }catch{
    if(Date.now()>=directoryRetryAt) directoryRetryAt=Date.now()+45000;
    status=lastDirectory?'cached':'sample';
    rows=lastDirectory??catalog.map(stock=>({...stock,exchange:'NSE'}));
  }
  return {rows,status};
}
export async function searchEquities(query) {
  const {rows,status}=await loadEquityDirectory();
  const q=query.trim().toUpperCase();
  const rank=stock=>{
    const name=stock.name.toUpperCase();
    if(stock.symbol===q||stock.isin===q) return 0;
    if(stock.symbol.startsWith(q)) return 1;
    if(name.startsWith(q)) return 2;
    if(name.includes(q)||stock.symbol.includes(q)) return 3;
    return 4;
  };
  const results=rows.map(stock=>({stock,rank:rank(stock)})).filter(item=>item.rank<4)
    .sort((a,b)=>a.rank-b.rank||a.stock.symbol.localeCompare(b.stock.symbol)).slice(0,10).map(item=>item.stock);
  return {results,status,source:equityDirectory};
}
const priorDate=(days)=>new Date(Date.now()-days*86400000);
const keyDate=(day)=>day.split('-').reverse().join('-');
const nseHeaders={'User-Agent':'Mozilla/5.0','Referer':exchangePage,'Accept':'application/json'};
const cutoffIST=()=>new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Kolkata',hour12:false});
const reportsPage='https://www.nseindia.com/all-reports';
let yahooRetryAt=0;
async function exchangeClose(today,afterClose){
  return cached('exchange-close:'+today+':'+afterClose,600000,async()=>{
    for(let offset=afterClose?0:1;offset<8;offset+=3){
      const dates=[offset,offset+1,offset+2].filter(i=>i<8).map(i=>dateIST(priorDate(i)));
      const reports=await Promise.allSettled(dates.map(async day=>{
        const file='https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_'+day.replaceAll('-','')+'_F_0000.csv.zip';
        const response=await get(file);
        return {quotes:parseDailyReport(Buffer.from(await response.arrayBuffer()),day),file};
      }));
      const latest=reports.find(report=>report.status==='fulfilled');
      if(latest)return latest.value;
    }
    throw Error('NSE daily report unavailable');
  });
}
export async function quote(symbol, mode, refresh=false) {
  const source='https://finance.yahoo.com/quote/'+encodeURIComponent(symbol+'.NS')+'/history/';
  if(mode==='demo') return {mode,source:null,...metrics(demoBars(symbol))};
  const today=dateIST(), afterClose=cutoffIST()>='15:45:00';
  try {
    return await cached('price:'+symbol+':'+today+':'+afterClose,1800000,async()=>{
      if(Date.now()<yahooRetryAt)throw Error('Yahoo Finance rate limit');
      const response=await get(yahoo+encodeURIComponent(symbol+'.NS')+'?interval=1d&range=2y');
      const entry=(await response.json()).chart.result?.[0];
      if(!entry) throw Error('Price history unavailable');
      const q=entry.indicators.quote[0], adj=entry.indicators.adjclose?.[0]?.adjclose;
      const bars=entry.timestamp.map((t,i)=>({date:dateIST(new Date(t*1000)),close:q.close[i],volume:q.volume[i],adjusted:adj?.[i]}))
        .filter(b=>b.close>0&&b.adjusted>0&&Number.isFinite(b.volume)&&(b.date<today||(b.date===today&&afterClose)));
      if(!bars.length) throw Error('No completed session');
      return {mode,source,...metrics(bars)};
    },refresh);
  } catch(error) {
    if(/HTTP (429|403)$/.test(error.message))yahooRetryAt=Date.now()+120000;
    try{
      const {quotes,file}=await exchangeClose(today,afterClose);
      const row=quotes.get(symbol);
      if(row)return {mode,source:reportsPage,archive:file,fallback:true,...row,volume:null,coverageNote:'NSE reported close and prior close. Adjusted return history and the 20-session volume baseline are unavailable.'};
    }catch{}
    return {mode,source,error:error.message};
  }
}
function nseTime(value) {
  const m=/^(\d{2})-([A-Za-z]{3})-(\d{4})\s+(\d\d:\d\d:\d\d)/.exec(value??'');
  if(!m) {
    const iso=/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})$/.exec(value??'');
    return iso?Date.parse(iso[1]+'T'+iso[2]+'+05:30'):NaN;
  }
  const month=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'].indexOf(m[2].toLowerCase())+1;
  return Date.parse(m[3]+'-'+String(month).padStart(2,'0')+'-'+m[1]+'T'+m[4]+'+05:30');
}
function normalizeFilings(rows) {
  if(!Array.isArray(rows)) throw Error('Unexpected NSE response');
  const unique=new Map();
  for(const row of rows){
    const symbol=row.symbol, title=row.desc||'Corporate disclosure', detail=row.attchmntText||'';
    const primary=nseTime(row.an_dt);
    const timestamp=Number.isFinite(primary)?primary:nseTime(row.sort_date);
    if(!symbol||!Number.isFinite(timestamp)) continue;
    const url=/^https:\/\/(?:nsearchives|archives|www)\.nseindia\.com\//i.test(row.attchmntFile??'')?row.attchmntFile:exchangePage;
    const id=String(row.seq_id??row.sm_id??[symbol,timestamp,title,url].join('|'));
    unique.set(id,{id,symbol,title,detail:String(detail).slice(0,900),timestamp,url,category:classify(title+' '+detail)});
  }
  return [...unique.values()];
}
const demoTemplates=[
  ['Financial results','Illustrative example: the board approved quarterly results. Check whether sales and profit moved together.'],
  ['Change in management','Illustrative example: the CFO resigned. Check the effective date and succession plan.'],
  ['Compliance certificate','Illustrative example: the company submitted routine paperwork.'],
  ['Acquisition','Illustrative example: the company announced a proposed acquisition. Check price, financing and approvals.'],
  ['Investor meeting schedule','Illustrative example: a meeting schedule was filed.']
];
export async function filings(hours,mode,refresh=false,rssOnly=false) {
  const start=Date.now()-hours*3600000;
  if(mode==='demo') {
    const startOfHour=Math.floor(Date.now()/3600000)*3600000;
    return {mode,scope:'Illustrative filings',rows:catalog.flatMap((s,i)=>{
      if(i%2) return [];
      const [title,detail]=demoTemplates[i%demoTemplates.length];
      return [{id:'demo-'+i,symbol:s.symbol,title,detail,timestamp:startOfHour-(i+1)*3600000,url:null,category:classify(title)}];
    }).filter(r=>r.timestamp>=start)};
  }
  const from=keyDate(dateIST(new Date(start))), to=keyDate(dateIST());
  const inWindow=rows=>rows.filter(r=>r.timestamp>=start&&r.timestamp<=Date.now());
  let primaryError;
  try {
    if(rssOnly)throw Error('RSS filing requested');
    const rows=await cached('filings:'+from+':'+to,180000,async()=>{
      const response=await get(nse+'/api/corporate-announcements?index=equities&from_date='+from+'&to_date='+to,nseHeaders);
      return normalizeFilings(await response.json());
    },refresh);
    return {mode,scope:'NSE equity announcements returned by the exchange feed',rows:inWindow(rows)};
  } catch(error) {primaryError=error;}
  try{
    const rows=await cached('nse-rss',180000,async()=>{
      const [feed,directory]=await Promise.all([get('https://nsearchives.nseindia.com/content/RSS/Online_announcements.xml'),loadEquityDirectory()]);
      return parseAnnouncementRss(await feed.text(),directory.rows,nseTime,classify,exchangePage);
    },refresh);
    return {mode,scope:'NSE recent announcements RSS',coverageNote:'The primary feed is unavailable. This fallback shows recent RSS entries matched to NSE company names. It may cover less than your selected window.',rows:inWindow(rows)};
  }catch{return {mode,scope:'NSE equity feed unavailable',error:primaryError.message,rows:[]};}
}
const infosys='https://www.infosys.com';
const sec='https://www.sec.gov/Archives/edgar/data/';
const known={
  INFY:[
    {type:'Annual report',label:'Infosys FY2025–26 integrated annual report',url:infosys+'/investors/reports-filings/annual-report/annual/documents/infosys-ar-26.pdf'},
    {type:'Annual report',label:'Infosys FY2025–26 integrated annual report (HTML)',url:infosys+'/investors/reports-filings/annual-report/annual-reports/ar-2025-26.html'},
    {type:'Earnings call',label:'Infosys Q2 FY2027 earnings call',url:infosys+'/investors/reports-filings/quarterly-results/2026-2027/q2/documents/transcripts/earningscall.pdf'},
    {type:'Earnings call',label:'Infosys Q4 FY2026 earnings call filed with SEC',url:sec+'1067491/000106749126000018/exv99w05.htm'}
  ],
  TCS:[
    {type:'Annual report',label:'TCS FY2024–25 integrated annual report',url:'https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/ar/annual-report-2024-2025.pdf'},
    {type:'Earnings call',label:'TCS Q4 FY2025 earnings call',url:'https://www.tcs.com/content/dam/tcs/investor-relations/financial-statements/2024-25/q4/Management%20Commentary/Transcript%20of%20the%20Q4%202024-25%20Earnings%20Conference%20Call%20held%20at%201900%20hrs%20IST%20on%20Apr%2010%2C%202025.pdf'}
  ]
};
const secCik={INFY:'0001067491',WIPRO:'0001123799',HDFCBANK:'0001144967',ICICIBANK:'0001103838',DRREDDY:'0001135951'};
export async function statements(symbol,refresh) {
  const cik=secCik[symbol];
  if(!cik||!process.env.SEC_USER_AGENT) return null;
  const url='https://data.sec.gov/api/xbrl/companyfacts/CIK'+cik+'.json';
  return cached('sec:'+symbol,86400000,async()=>{
    const facts=(await (await get(url,{'User-Agent':process.env.SEC_USER_AGENT})).json()).facts['ifrs-full']??{};
    const revenueTags=['Revenue','RevenueFromContractsWithCustomers'];
    const factsFor=(tags,currency,period)=>{
      const entries=tags.flatMap(tag=>facts[tag]?.units?.[currency]??[]);
      return entries.filter(e=>{
        if(!['20-F','6-K'].includes(e.form)||!Number.isFinite(e.val))return false;
        const days=(Date.parse(e.end)-Date.parse(e.start))/86400000;
        if(period==='instant')return e.form==='20-F'&&!e.start;
        if(period==='quarter')return days>=75&&days<=105;
        return e.form==='20-F'&&days>=350&&days<=380;
      })
        .sort((a,b)=>b.end.localeCompare(a.end)||b.filed.localeCompare(a.filed));
    };
    const series=['INR','USD'].map(currency=>({currency,revenues:factsFor(revenueTags,currency,'year')}))
      .sort((a,b)=>(b.revenues[0]?.end??'').localeCompare(a.revenues[0]?.end??''));
    const {currency,revenues}=series[0];
    const years=[...new Set(revenues.map(e=>e.end))].slice(0,4);
    if(!years.length) return null;
    const at=(tags,end,period)=>factsFor(tags,currency,period).find(e=>e.end===end)?.val;
    const profitTags=['ProfitLossAttributableToOwnersOfParent'];
    const yearsData=years.map(end=>({
      end,revenue:revenues.find(e=>e.end===end)?.val,
      income:at(profitTags,end,'year'),
      equity:at(['EquityAttributableToOwnersOfParent'],end,'instant'),
      debt:at(['Borrowings'],end,'instant'),
      cash:at(['CashFlowsFromUsedInOperatingActivities'],end,'year')
    }));
    const current=yearsData[0];
    const ratios=fundamentals(current,yearsData[1]??{});
    ratios.debtToEquity=Number.isFinite(current.debt)&&current.equity>0?current.debt/current.equity:null;
    ratios.cashConversion=Number.isFinite(current.cash)&&current.income>0?current.cash/current.income:null;
    const quarterly=factsFor(revenueTags,currency,'quarter');
    const quarters=[...new Set(quarterly.map(e=>e.end))].slice(0,8).map(end=>({
      end,revenue:at(revenueTags,end,'quarter'),income:at(profitTags,end,'quarter'),
      pbt:at(['ProfitLossBeforeTax'],end,'quarter'),ebitda:at(['EarningsBeforeInterestTaxDepreciationAndAmortisation'],end,'quarter'),
      source:filingURL(cik,quarterly.find(e=>e.end===end).accn)
    }));
    const filing=revenues[0].accn;
    return {currency,years:yearsData,ratios,quarters,source:filingURL(cik,filing),dataSource:url};
  },refresh);
}
const filingURL=(cik,accession)=>sec+Number(cik)+'/'+accession.replaceAll('-','')+'/'+accession+'-index.htm';
export async function nseQuarterly(symbol,refresh=false,asOf=Date.now()){
  const listing=await cached('nse-results:'+symbol,3600000,async()=>{
    const url=nse+'/api/integrated-filing-results?index=equities&symbol='+encodeURIComponent(symbol);
    const body=await (await get(url,nseHeaders)).json();
    if(!Array.isArray(body.data))throw Error('Unexpected quarterly results response');
    return body.data;
  },refresh);
  const candidates=listing.filter(r=>r.symbol===symbol&&/financial/i.test(r.type??'')&&
    /^https:\/\/nsearchives\.nseindia\.com\/corporate\/xbrl\/[\w.-]+\.xml$/i.test(r.xbrl??''))
    .map(r=>({...r,period:nseTime(r.qe_Date+' 00:00:00'),filed:nseTime(r.revised_Date??r.broadcast_Date??r.creation_Date)}))
    .filter(r=>r.period<=asOf&&r.filed<=asOf+3*86400000)
    .sort((a,b)=>b.period-a.period||Number(b.consolidated==='Consolidated')-Number(a.consolidated==='Consolidated')||b.filed-a.filed);
  const chosen=candidates[0];
  if(!chosen)return null;
  const unique=[...new Map(candidates.filter(row=>row.consolidated===chosen.consolidated).reverse().map(row=>[row.period,row])).values()].reverse();
  const selected=unique.filter(row=>(chosen.period-row.period)/86400000<=380).slice(0,5);
  const results=await Promise.allSettled(selected.map(async (filing,i)=>{
    const periods=await cached('nse-result-xml:'+filing.xbrl,86400000,async()=>{
      const response=await get(filing.xbrl,{}, {redirect:'error',signal:AbortSignal.timeout(11000)});
      if(Number(response.headers.get('content-length'))>15000000)throw Error('Results filing exceeds size limit');
      const body=await response.text();
      if(body.length>15000000)throw Error('Results filing exceeds size limit');
      return parseNseQuarterly(body);
    },refresh&&i===0);
    const end=dateIST(new Date(filing.period));
    const current=periods.find(row=>row.end===end);
    if(!current)return null;
    const source=filing.ixbrl?.startsWith('https://nsearchives.nseindia.com/')?filing.ixbrl:filing.xbrl;
    return {...current,source};
  }));
  const matching=results.flatMap(r=>r.status==='fulfilled'&&r.value?[r.value]:[]);
  if(matching[0]?.end!==dateIST(new Date(chosen.period)))return null;
  return {quarterly:quarterlyComparison(matching),periods:matching,currency:'INR',source:matching[0].source,basis:chosen.consolidated??'Reported',note:'Reported NSE figures. The EBITDA proxy, where available, adds finance costs and depreciation to profit before tax. Changes use comparable positive baselines.'};
}
async function discover(symbol,refresh){
  const result=await Promise.allSettled([
    cached('annual:'+symbol,3600000,async()=>{
      const res=await get(nse+'/api/annual-reports?index=equities&symbol='+encodeURIComponent(symbol),nseHeaders);
      const body=await res.json();
      const rows=Array.isArray(body)?body:body.data??[];
      return [...new Map(rows.slice(0,5).reverse().map(r=>[r.toYr,r])).values()].reverse().slice(0,2).map(r=>({
        type:'Annual report',label:'NSE annual report '+(r.toYr??''),url:r.fileName??r.fileUrl
      }));
    },refresh),
    cached('transcript:'+symbol,3600000,async()=>{
      const from=keyDate(dateIST(priorDate(90))),to=keyDate(dateIST());
      const url=nse+'/api/corporate-announcements?index=equities&symbol='+encodeURIComponent(symbol)+'&from_date='+from+'&to_date='+to;
      const rows=normalizeFilings(await (await get(url,nseHeaders)).json());
      return rows.filter(r=>r.url!==exchangePage&&/transcript/i.test(r.title+' '+r.detail)).sort((a,b)=>b.timestamp-a.timestamp).slice(0,2)
        .map(r=>({type:'Earnings call',label:'NSE transcript filing · '+dateIST(new Date(r.timestamp)),url:r.url}));
    },refresh)
  ]);
  const sources=[...result.flatMap(r=>r.status==='fulfilled'?r.value:[]),...(known[symbol]??[])];
  return [...new Map(sources.filter(s=>/^https:\/\/(?:www\.nseindia\.com|nsearchives\.nseindia\.com|archives\.nseindia\.com|www\.infosys\.com|www\.tcs\.com|www\.sec\.gov)\//i.test(s.url??'')).map(s=>[s.url,s])).values()];
}
async function document(source,refresh){
  return cached('document:'+source.url,86400000,async()=>{
    const response=await get(source.url,{'User-Agent':source.url.includes('sec.gov/')?(process.env.SEC_USER_AGENT||'FINN research prototype'):'Mozilla/5.0',Accept:'application/pdf,text/html;q=0.9'},{redirect:'error',signal:AbortSignal.timeout(20000)});
    const size=Number(response.headers.get('content-length'));
    if(size>25000000) throw Error('Document exceeds size limit');
    const chunks=[];
    let total=0;
    for await(const chunk of response.body){
      total+=chunk.length;
      if(total>25000000) throw Error('Document exceeds size limit');
      chunks.push(chunk);
    }
    const bytes=Buffer.concat(chunks);
    const isPdf=bytes.subarray(0,5).toString()==='%PDF-';
    let hash=createHash('sha256').update(bytes).digest('hex');
    let content='';
    if(isPdf){
      try {
        const {extractPdf}=await import('./pdf.mjs');
        content=await extractPdf(bytes);
      } catch {return {...source,hash,status:'PDF linked; extraction unavailable'};}
    }else{
      const html=bytes.toString();
      content=(/<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html)?.[1]??html)
        .replace(/<(script|style|nav|footer|header)\b[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/g,' ');
    }
    const clean=content.replace(/\s+/g,' ').trim();
    if(!isPdf&&clean) hash=createHash('sha256').update(clean).digest('hex');
    return {...source,hash,status:clean?'Read':'No extractable text',text:passages(clean,source.type)};
  },refresh);
}
function passages(text='',type){
  if(type==='Management') return text.slice(0,18000);
  if(type==='Earnings call') return text.slice(0,19000);
  const windows=[text.slice(0,3500)];
  for(const pattern of [/management discussion/i,/business overview|business highlights/i,/consolidated statements of profit/i,/operating cash flow|cash flows/i,/borrowings|working capital/i,/risk management/i]){
    const match=pattern.exec(text);
    if(match) windows.push(text.slice(match.index,match.index+3200));
  }
  return windows.join('\n…\n');
}
export async function research(symbol, mode, refresh=false) {
  const [price, annual, discovered, results]=await Promise.all([
    quote(symbol,mode,refresh),
    mode==='live'?statements(symbol,refresh).catch(()=>null):null,
    mode==='live'?discover(symbol,refresh):known[symbol]??[],
    mode==='live'?nseQuarterly(symbol,refresh).catch(()=>null):null
  ]);
  const types=[...new Set(discovered.map(s=>s.type))];
  const docs=await Promise.all(types.map(async type=>{
    const candidates=discovered.filter(s=>s.type===type);
    if(mode==='demo') return {...candidates[0],status:'Reference link only in sample mode'};
    let first;
    for(const source of candidates.slice(0,5)){
      const doc=await document(source,refresh).catch(()=>({...source,status:'Fetch unavailable'}));
      first??=doc;
      if(doc.text) return doc;
    }
    return first;
  }));
  const guidance=mode==='live'?guidanceScorecard(symbol):null;
  const readable=docs.flatMap((s,i)=>s.text?[{citation:i+1,type:s.type,evidence:s.text}]:[]);
  const key=process.env.GEMINI_API_KEY?.trim();
  const model=process.env.GEMINI_MODEL?.trim()||DEFAULT_GEMINI_MODEL;
  const out={symbol,mode,createdAt:new Date().toISOString(),price,annual,results,guidance,sources:docs.map(({text,...source})=>source),insights:mode==='live'?reportInsights(docs,annual,results,guidance):[],narrative:null,aiStatus:mode==='demo'?'Sample prices. Live mode retrieves primary documents.':readable.length?'Source highlights are available. Set GEMINI_API_KEY to enable the Gemini brief.':'Readable primary documents were unavailable for this request.'};
  if(mode==='live'&&key&&readable.length){
    const payload=geminiPayload(symbol,readable,model);
    try {
      const cacheKey='gemini:'+createHash('sha256').update(JSON.stringify({model,payload})).digest('hex');
      out.narrative=await cached(cacheKey,86400000,async()=>{
        const brief=await generateGeminiBrief({key,model,payload});
        if(!brief)throw Error('No usable brief was returned.');
        return brief;
      });
      out.aiModel=model;
      out.aiStatus='Gemini brief grounded in the primary-source excerpts.';
    }catch(error){out.aiStatus='Gemini brief unavailable: '+error.message;}
  }
  return out;
}
export async function filingInsight(row){
  if(row.category==='Results'){
    const nse=await nseQuarterly(row.symbol,false,row.timestamp).catch(()=>null);
    if(nse&&(row.timestamp-Date.parse(nse.quarterly.period))/86400000<=105)return nse;
    const annual=await statements(row.symbol,false).catch(()=>null);
    const filedDay=dateIST(new Date(row.timestamp));
    const quarters=(annual?.quarters??[]).filter(q=>q.end<=filedDay);
    const age=quarters[0]?(Date.parse(filedDay)-Date.parse(quarters[0].end))/86400000:Infinity;
    if(age<=105)return {quarterly:quarterlyComparison(quarters),currency:annual.currency,source:quarters[0].source,note:'Comparable SEC company facts. Profit after tax is attributable to owners. Some fields may be unavailable.'};
    return {note:'Comparable structured quarterly figures for this filing were unavailable. No changes were estimated.'};
  }
  if(row.category==='Management'&&row.url&&row.url!==exchangePage){
    const doc=await document({type:'Management',url:row.url},false).catch(()=>null);
    const evidence=extractEvidence(doc?.text??'',/experience|previously|served as|worked|career|expertise/i);
    return {evidence,note:evidence?'Background excerpt from the exchange disclosure.':'The available disclosure did not yield a readable career background.'};
  }
  return {note:'The disclosure summary above is the available evidence.'};
}
export function reportDiff(old,next){
  const diff=[];
  if(old.price.date&&next.price.date&&old.price.close!==next.price.close) diff.push({label:'Closing price',before:old.price.close,after:next.price.close});
  if(old.price.date&&next.price.date&&old.price.date!==next.price.date) diff.push({label:'Latest completed session',before:old.price.date,after:next.price.date});
  for(const n of [21,63,252]){
    const a=old.price.returns?.[n]?.latest,b=next.price.returns?.[n]?.latest;
    if(Number.isFinite(a)&&Number.isFinite(b)&&Math.abs(a-b)>.005) diff.push({label:n+'-session return (%)',before:a,after:b});
  }
  for(const [name,value] of Object.entries(next.annual?.ratios??{})){
    const prior=old.annual?.ratios?.[name];
    if(Number.isFinite(value)&&value!==prior) diff.push({label:name,before:prior??'Unavailable',after:value});
  }
  if(next.results&&old.results?.quarterly.period!==next.results.quarterly.period)diff.push({label:'Latest reported quarter',before:old.results?.quarterly.period??'Unavailable',after:next.results.quarterly.period});
  if(next.results&&old.results&&next.results.currency===old.results.currency&&next.results.basis===old.results.basis){
    for(const row of next.results.quarterly.rows){
      const prior=old.results.quarterly.rows.find(item=>item.label===row.label)?.value;
      if(Number.isFinite(prior)&&Number.isFinite(row.value)&&row.value!==prior)diff.push({label:row.label+' ('+next.results.currency+')',before:prior,after:row.value});
    }
  }
  for(const s of next.sources){
    const prior=old.sources.find(o=>o.type===s.type);
    if(s.hash&&prior?.hash!==s.hash) diff.push({label:s.type,before:prior?.hash?prior.label+' (saved version)':'No verified snapshot',after:s.label+' (new version)'});
    else if(!s.hash&&old.mode==='live') diff.push({label:s.type+' verification',before:prior?.status??'Unavailable',after:s.status});
  }
  if(next.price.error) diff.push({label:'Market data check',before:old.price.date??'Unavailable',after:next.price.error});
  if(next.mode==='live'&&!next.sources.length) diff.push({label:'Primary source check',before:old.sources.length+' linked',after:'No documents returned'});
  return diff;
}

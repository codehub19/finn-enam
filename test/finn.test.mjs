import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {metrics,briefingSlot,csvHoldings,classify,fundamentals} from '../data.mjs';
import {reportDiff,parseEquityDirectory} from '../providers.mjs';
import {parseNseQuarterly,quarterlyComparison,reportInsights,RESEARCH_SECTIONS} from '../insights.mjs';
import {guidanceScorecard} from '../guidance.mjs';
import {DEFAULT_GEMINI_MODEL,geminiPayload,generateGeminiBrief,parseGeminiSections} from '../gemini.mjs';
import {parseAnnouncementRss,parseDailyReport} from '../exchange.mjs';
import {parseWorldFeed,selectWorldNews} from '../news.mjs';
test('global news only surfaces dated official links and labels a wider lookback',()=>{
 const feed={url:'https://www.eia.gov/rss/feed.xml',source:'EIA',topic:'Energy',filter:/oil/i};
 const item=(title,href,date)=>'<item><title>'+title+'</title><link>'+href+'</link><pubDate>'+date+'</pubDate></item>';
 const at=Date.parse('2026-11-10T12:00:00Z');
 const xml='<rss>'+item('Oil supply &amp; demand','/release','2026-11-09T06:00:00Z')+item('Oil','https://invalid.example/release','2026-11-10T11:00:00Z')+item('Other release','/other','2026-11-10T09:00:00Z')+'</rss>';
 const [row,...rest]=parseWorldFeed(xml,feed);
 assert.equal(row.title,'Oil supply & demand');
 assert.equal(row.url,'https://www.eia.gov/release');
 assert.equal(rest.length,0);
 assert.equal(selectWorldNews([row,row],at).hours,72);
 const recent={...row,url:'https://www.eia.gov/recent',timestamp:at-3600000};
 assert.deepEqual(selectWorldNews([row,recent],at),{hours:24,items:[recent]});
});
test('Gemini uses the server-side header and returns only public answer text',async()=>{
 const payload=geminiPayload('INFY',[{citation:1,type:'Annual report',evidence:'Primary evidence.'}]);
 assert.equal(payload.generationConfig.responseSchema.items.properties.citations.items.type,'INTEGER');
 const request=async (url,options)=>{
  assert.equal(url,'https://generativelanguage.googleapis.com/v1beta/models/'+DEFAULT_GEMINI_MODEL+':generateContent');
  assert.equal(options.headers['x-goog-api-key'],'fixture-key');
  assert.deepEqual(JSON.parse(options.body),payload);
  return new Response(JSON.stringify({candidates:[{finishReason:'STOP',content:{parts:[{text:'Private reasoning',thought:true},{text:'Company evidence [1].'}]}}]}));
 };
 assert.equal(await generateGeminiBrief({key:'fixture-key',payload,request}),'Company evidence [1].');
 await assert.rejects(generateGeminiBrief({key:'fixture-key',payload,request:async()=>new Response('',{status:429})}),/quota or rate limit/);
});
test('research preserves the requested sections and drops model text with unknown sources',()=>{
 const topics=reportInsights([],null,{quarterly:null,periods:[]}).map(row=>row.title);
 assert.deepEqual(topics,['Business snapshot','Financial snapshot','Trajectory','Balance sheet','Cash quality','Narrative vs. numbers','Guidance','Bull vs. bear']);
 const output=[
  {title:'Guidance',text:'Unverified guidance.',citations:[2]},
  {title:'Cash quality',text:'Reported cash flow.',citations:[1,'1']},
  {title:'Business snapshot',text:'Reported business model.',citations:[1]}
 ];
 assert.deepEqual(parseGeminiSections(JSON.stringify(output),[{citation:1}]),[
  output[2],{...output[1],citations:[1]}
 ]);
 assert.deepEqual(topics,RESEARCH_SECTIONS);
});
test('NSE fallback parses a reported close and matches RSS entries by company name',()=>{
 const data=deflateRawSync('TradDt,FinInstrmTp,TckrSymb,SctySrs,ClsPric,PrvsClsgPric,TtlTradgVol\n2026-11-09,STK,INFY,EQ,110,100,4500\n');
 const header=Buffer.alloc(30);
 header.writeUInt32LE(0x04034b50);
 header.writeUInt16LE(8,8);
 header.writeUInt32LE(data.length,18);
 const quote=parseDailyReport(Buffer.concat([header,data]),'2026-11-09').get('INFY');
 assert.equal(quote.close,110);
 assert.equal(quote.tradedVolume,4500);
 assert.ok(Math.abs(quote.day-10)<1e-8);
 const xml='<rss><item><title>Infosys Limited</title><description>Revenue update |SUBJECT: Financial results</description><pubDate>fixture</pubDate></item><item><title>Other issuer</title><pubDate>fixture</pubDate></item></rss>';
 const rows=parseAnnouncementRss(xml,[{symbol:'INFY',name:'Infosys Limited'}],()=>1000,classify,'https://www.nseindia.com/');
 assert.equal(rows.length,1);
 assert.equal(rows[0].symbol,'INFY');
 assert.equal(rows[0].category,'Results');
});
test('Infosys guidance uses matching fiscal-year actuals and keeps open outcomes pending',()=>{
 const score=guidanceScorecard('INFY');
 assert.equal(score.rows.length,4);
 assert.deepEqual(score.rows[0].revenue,[3,3.5]);
 assert.equal(score.rows[0].revenueOutcome,'Within range');
 assert.equal(score.rows[0].marginOutcome,'Within range');
 assert.equal(score.rows[0].final.reportedMargin,20.3);
 assert.ok(score.rows.slice(1).every(row=>row.final===null&&row.revenueOutcome==='Pending full-year results'));
 assert.deepEqual(score.rows.at(-1).revenue,[1,2]);
 assert.equal(guidanceScorecard('BAJFINANCE'),null);
});
test('reported quarterly results compare like periods and keep missing figures blank',()=>{
 const xml='<x:unit id="INR"><x:measure>iso:INR</x:measure></x:unit>'+
  '<x:context id="quarter"><x:startDate>2026-07-01</x:startDate><x:endDate>2026-09-30</x:endDate></x:context>'+
  '<x:context id="annual"><x:startDate>2025-10-01</x:startDate><x:endDate>2026-09-30</x:endDate></x:context>'+
  '<n:RevenueFromOperations contextRef="annual" unitRef="INR">900</n:RevenueFromOperations>'+
  '<n:RevenueFromOperations contextRef="quarter" unitRef="INR">120</n:RevenueFromOperations>'+
  '<n:ProfitBeforeTax contextRef="quarter" unitRef="INR">16</n:ProfitBeforeTax>'+
  '<n:FinanceCosts contextRef="quarter" unitRef="INR">2</n:FinanceCosts>'+
  '<n:DepreciationDepletionAndAmortisationExpense contextRef="quarter" unitRef="INR">3</n:DepreciationDepletionAndAmortisationExpense>';
 const [latest]=parseNseQuarterly(xml);
 assert.equal(latest.revenue,120);
 assert.equal(latest.ebitdaProxy,21);
 const compare=quarterlyComparison([latest,{end:'2026-06-30',revenue:100},{end:'2025-09-30',revenue:80}]);
 assert.ok(Math.abs(compare.rows[0].qoq-20)<1e-8);
 assert.equal(compare.rows[0].yoy,50);
 assert.equal(compare.rows[3].value,null);
 const insights=reportInsights([{type:'Annual report',text:'The company serves customers through its services and products in several business segments.'}],null);
 assert.equal(insights[0].evidence.source,1);
});
test('NSE equity directory handles quoted names and filters unsupported symbols',()=>{
 const csv='SYMBOL, NAME OF COMPANY, SERIES, ISIN NUMBER\r\nACME,"Acme, Ltd.",EQ,INE000000001\r\nINVALID!,Invalid,EQ,INE000000002';
 assert.deepEqual(parseEquityDirectory(csv),[{symbol:'ACME',name:'Acme, Ltd.',isin:'INE000000001',exchange:'NSE'}]);
});
test('rolling returns and prior-volume baseline',()=>{
 const bars=Array.from({length:22},(_,i)=>({date:String(i),close:100+i,adjusted:100+i,volume:i===21?300:100}));
 const m=metrics(bars);
 assert.ok(Math.abs(m.returns[21].latest-21)<1e-8);
 assert.equal(m.returns[63].latest,null);
 assert.equal(m.volume,3);
 assert.equal(m.close,121);
});
test('financial math, ranking rules and CSV validation',()=>{
 assert.deepEqual(fundamentals({revenue:120,income:24,equity:110},{revenue:100,equity:90}),{revenueGrowth:20,netMargin:20,returnOnEquity:24});
 assert.equal(classify('Acquisition of a subsidiary'),'M&A');
 assert.equal(classify('Compliance certificate'),'Routine');
 assert.deepEqual(csvHoldings('\uFEFF"symbol",quantity,average_cost\r\ninfy,2,50'),[{symbol:'INFY',quantity:2,average:50}]);
 assert.deepEqual(csvHoldings('symbol,quantity,average_cost,purchase_date\nINFY,2,50,2024-02-29'),[{symbol:'INFY',quantity:2,average:50,purchaseDate:'2024-02-29'}]);
 assert.throws(()=>csvHoldings('symbol,quantity,average_cost,purchase_date\nINFY,2,50,2023-02-29'),/Invalid purchase date/);
 assert.throws(()=>csvHoldings('symbol,quantity,average_cost\nINFY,2,0\nINFY,5,4'),/duplicate/);
 assert.throws(()=>csvHoldings('symbol,quantity,average_cost\nINFY,2,Infinity'),/Invalid/);
});
test('briefings use Asia/Kolkata and fail closed on holidays or missing calendar',()=>{
 const calendar={year:2026,holidays:['2026-11-10']};
 assert.deepEqual(briefingSlot(new Date('2026-11-09T03:25:00Z'),calendar),{day:'2026-11-09',slot:'pre'});
 assert.deepEqual(briefingSlot(new Date('2026-11-09T10:30:00Z'),calendar),{day:'2026-11-09',slot:'post'});
 assert.equal(briefingSlot(new Date('2026-11-10T03:25:00Z'),calendar),null);
 assert.equal(briefingSlot(new Date('2026-11-08T10:30:00Z'),calendar),null);
 assert.deepEqual(briefingSlot(new Date('2026-11-08T10:40:00Z'),{...calendar,special:{'2026-11-08':{pre:825,post:970}}}),{day:'2026-11-08',slot:'post'});
 assert.equal(briefingSlot(new Date('2026-11-09T10:30:00Z'),null),null);
});
test('report diff reports changed documents without treating failed downloads as changes',()=>{
 const old={mode:'live',price:{date:'2026-11-03',close:30},sources:[{type:'Annual report',label:'Annual filing',hash:'old'}]};
 const next={...old,price:{date:'2026-11-04',close:31},sources:[{type:'Annual report',label:'New annual filing',hash:'new'}]};
 assert.deepEqual(reportDiff(old,next).map(d=>d.label),['Closing price','Latest completed session','Annual report']);
 assert.equal(reportDiff(old,{...old,sources:[{type:'Annual report',status:'Fetch unavailable'}]})[0].label,'Annual report verification');
});
let server,url,dir;
before(async()=>{
 dir=await mkdtemp(join(tmpdir(),'finn-test-'));
 server=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:'0',HOST:'127.0.0.1',FINN_DB:join(dir,'test.sqlite'),PUBLIC_ORIGIN:'',VAPID_PUBLIC_KEY:''}});
 server.stderr.on('data',chunk=>process.stderr.write(chunk));
 url=await new Promise((resolve,reject)=>{
   server.once('exit',code=>reject(Error('Test server exited '+code)));
   server.once('error',reject);
   server.stdout.once('data',chunk=>resolve(String(chunk).match(/http:\/\/\S+/)[0]));
 });
});
after(async()=>{
 if(server&&server.exitCode===null){server.kill();await once(server,'exit');}
 if(dir)await rm(dir,{force:true,recursive:true});
});
async function api(path,payload,cookie){
 const res=await fetch(url+'/api/'+path,{headers:{...(cookie?{Cookie:cookie}:{}),...(payload?{'Content-Type':'application/json'}:{})},...(payload?{method:'POST',body:JSON.stringify(payload)}:{})});
 return {status:res.status,data:await res.json(),cookie:res.headers.get('set-cookie')?.split(';')[0]};
}
test('PWA shell, private accounts, import, digest, sector rankings and saved-report recheck',async()=>{
 const health=await fetch(url+'/healthz');
 assert.equal(health.status,200);
 assert.deepEqual(await health.json(),{status:'ok'});
 for(const name of ['/','/app.js','/sw.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/sample-holdings.csv']) assert.equal((await fetch(url+name)).status,200,name);
 assert.equal((await api('state')).status,401);
 const a=await api('register',{email:'one@example.test',password:'very-long-test-password'});
 const b=await api('register',{email:'two@example.test',password:'another-test-password'});
 assert.equal(a.status,200); assert.equal(b.status,200);
 const state=await api('state',null,a.cookie);
 assert.equal((await api('subscription/test',{endpoint:'https://fcm.googleapis.com/example'},a.cookie)).status,503);
 assert.equal(state.data.holdings.length,18);
 assert.equal(state.data.push.enabled,false);
 const digest=await api('digest?hours=48',null,a.cookie);
 assert.ok(digest.data.owned.length);
 assert.ok(digest.data.owned.every(f=>state.data.holdings.some(h=>h.symbol===f.symbol)));
 const anomalies=await api('scan',null,a.cookie);
 assert.ok(anomalies.data.alerts.some(a=>a.symbol==='PERSISTENT'));
 assert.ok(anomalies.data.alerts.some(a=>a.symbol==='TATAPOWER'));
 const rank=await api('sector?name=Technology&days=63',null,a.cookie);
 assert.equal(rank.data.rows.length,4);
 assert.ok(rank.data.rows.every((r,i,rows)=>i===0||r.performance<=rows[i-1].performance));
 const draft=await api('research',{symbol:'INFY'},a.cookie);
 assert.equal(draft.status,200);
 const saved=await api('save-report',{id:draft.data.draftId},a.cookie);
 assert.equal(saved.status,200);
 assert.equal((await api('recheck',{id:saved.data.id},b.cookie)).status,404);
 assert.equal((await api('recheck',{id:saved.data.id},a.cookie)).status,200);
 assert.equal((await api('watch',{symbol:'INFY'},a.cookie)).status,200);
 const holding={symbol:'BAJFINANCE',name:'Bajaj Finance',quantity:4,average:800,purchaseDate:'2025-04-15'};
 assert.equal((await api('holding',{...holding,purchaseDate:'2025-02-30'},a.cookie)).status,400);
 assert.equal((await api('holding',holding,a.cookie)).status,200);
 assert.deepEqual((await api('state',null,a.cookie)).data.holdings.find(h=>h.symbol===holding.symbol),holding);
 assert.equal((await api('import',{csv:'symbol,quantity,average_cost\nINFY,2,100'},a.cookie)).status,200);
 assert.equal((await api('state',null,a.cookie)).data.holdings.length,1);
 const isolated=(await api('state',null,b.cookie)).data;
 assert.equal(isolated.holdings.length,18);assert.deepEqual(isolated.watch,[]);assert.deepEqual(isolated.saved,[]);
 assert.equal((await api('logout',{},a.cookie)).status,200);
 assert.equal((await api('state',null,a.cookie)).status,401);
 assert.equal((await api('login',{email:'one@example.test',password:'very-long-test-password'})).status,200);
});

test('guest sessions are private and can be signed out',async()=>{
 const guest=await api('guest',{});
 assert.equal(guest.status,200);
 assert.equal(guest.data.guest,true);
 const other=await api('guest',{});
 assert.equal((await api('state',null,guest.cookie)).data.guest,true);
 assert.equal((await api('watch',{symbol:'TCS'},guest.cookie)).status,200);
 assert.deepEqual((await api('state',null,other.cookie)).data.watch,[]);
 assert.equal((await api('logout',{},guest.cookie)).status,200);
 assert.equal((await api('state',null,guest.cookie)).status,401);
});

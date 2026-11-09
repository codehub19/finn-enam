import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {metrics,briefingSlot,csvHoldings,classify,fundamentals} from '../data.mjs';
import {reportDiff,parseEquityDirectory} from '../providers.mjs';
import {parseNseQuarterly,quarterlyComparison,reportInsights} from '../insights.mjs';
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
 for(const name of ['/','/app.js','/sw.js','/manifest.webmanifest','/icon-192.png','/icon-512.png','/sample-holdings.csv']) assert.equal((await fetch(url+name)).status,200,name);
 assert.equal((await api('state')).status,401);
 const a=await api('register',{email:'one@example.test',password:'very-long-test-password'});
 const b=await api('register',{email:'two@example.test',password:'another-test-password'});
 assert.equal(a.status,200); assert.equal(b.status,200);
 const state=await api('state',null,a.cookie);
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

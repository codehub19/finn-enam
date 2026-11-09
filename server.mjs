import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomBytes,randomUUID,scrypt,timingSafeEqual,createHash} from 'node:crypto';
import {promisify} from 'node:util';
import {DatabaseSync} from 'node:sqlite';
import {catalog,seeded,categories,csvHoldings,briefingSlot,dateIST,validPurchaseDate} from './data.mjs';
import {filings,quote,research,reportDiff,statements,searchEquities,filingInsight} from './providers.mjs';
const hashPassword=promisify(scrypt);
const root=fileURLToPath(new URL('.',import.meta.url));
const path=resolve(process.env.FINN_DB||resolve(root,'finn.sqlite'));
await mkdir(resolve(path,'..'),{recursive:true});
const db=new DatabaseSync(path);
db.exec(`
 PRAGMA journal_mode=WAL;
 PRAGMA busy_timeout=5000;
 PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, password TEXT NOT NULL, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS drafts (id TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL, data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS subscriptions (endpoint TEXT PRIMARY KEY, owner TEXT NOT NULL REFERENCES users(id), data TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS deliveries (endpoint TEXT NOT NULL, event TEXT NOT NULL, created INTEGER NOT NULL, PRIMARY KEY(endpoint,event));
`);
const cfg={price:5,volume:2,types:categories.slice(0,-1),pre:true,post:true,instant:false};
const initial=()=>({holdings:seeded,watch:[],saved:[],settings:cfg,mode:'demo'});
const json=(res,status,value,headers={})=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...headers});res.end(JSON.stringify(value));};
const fail=(status,message)=>Object.assign(Error(message),{status});
const tokenHash=token=>createHash('sha256').update(token).digest('hex');
const cookie=(token,max)=>'finn_session='+token+'; Path=/; HttpOnly; SameSite=Strict; Max-Age='+max+(process.env.PUBLIC_ORIGIN?.startsWith('https://')?'; Secure':'');
const sessionToken=req=>/(?:^|;\s*)finn_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie??'')?.[1];
const lookup=req=>{
  const token=sessionToken(req);
  return token?db.prepare('SELECT users.* FROM sessions JOIN users ON owner=users.id WHERE token=? AND expires>?').get(tokenHash(token),Date.now()):null;
};
async function body(req){
  let length=0;
  const chunks=[];
  for await(const chunk of req){
    length+=chunk.length;
    if(length>150000) throw fail(413,'Request is too large.');
    chunks.push(chunk);
  }
  try{
    const value=JSON.parse(Buffer.concat(chunks).toString()||'{}');
    if(value===null||typeof value!=='object'||Array.isArray(value)) throw Error('Expected an object');
    return value;
  }catch{throw fail(400,'Invalid request.');}
}
function symbolOf(text){
  const value=String(text??'').trim().toUpperCase();
  if(!/^[A-Z0-9&-]{1,24}$/.test(value)) throw fail(400,'Enter an NSE symbol such as INFY.');
  return value;
}
const caps=new Map();
function limit(key,max,window){
  const now=Date.now();
  if(caps.size>5000) for(const [k,entry] of caps) if(entry.until<=now) caps.delete(k);
  if(caps.size>12000&&!caps.has(key)) throw fail(429,'Please retry shortly.');
  const entry=caps.get(key)??{};
  const next=entry.until>now?entry:{count:0,until:now+window};
  if(++next.count>max) throw fail(429,'Too many requests. Try again shortly.');
  caps.set(key,next);
}
function eventLabel(row){
  return {Results:'Check whether the filing changes the earnings picture.', 'M&A':'Check the deal size, financing and approvals.', Management:'Check the effective date and succession plan.',Capital:'Check timing and potential effects on cash or share count.',Legal:'Check the exposure and whether management quantified it.',Routine:'Filed for your records.'}[row.category];
}
async function mapLimit(list, concurrency, fn){
  const result=[];
  let i=0;
  await Promise.all(Array.from({length:Math.min(concurrency,list.length)},async()=>{
    while(i<list.length){const index=i++; result[index]=await fn(list[index]);}
  }));
  return result;
}
async function digest(data,hours,refresh=false){
  const held=new Set(data.holdings.map(h=>h.symbol));
  const watched=new Set(data.watch);
  const sectors=new Set(catalog.filter(s=>held.has(s.symbol)).map(s=>s.sector));
  const related=new Set(catalog.filter(s=>!held.has(s.symbol)&&sectors.has(s.sector)).map(s=>s.symbol));
  const {rows,...feed}=await filings(hours,data.mode,refresh);
  const ranked=rows.map(r=>({...r,why:eventLabel(r),alert:r.category!=='Routine'&&data.settings.types.includes(r.category)}))
    .sort((a,b)=>Number(b.alert)-Number(a.alert)||Number(a.category==='Routine')-Number(b.category==='Routine')||b.timestamp-a.timestamp);
  return {...feed,checkedAt:new Date().toISOString(),owned:ranked.filter(r=>held.has(r.symbol)),related:ranked.filter(r=>related.has(r.symbol)&&r.category!=='Routine'),watch:ranked.filter(r=>watched.has(r.symbol)&&!held.has(r.symbol)&&r.category!=='Routine')};
}
async function scan(data,todayOnly=false,refresh=false){
  const results=await mapLimit(data.holdings,6,h=>quote(h.symbol,data.mode,refresh).then(price=>({symbol:h.symbol,...price})));
  const alerts=results.filter(q=>(!todayOnly||q.date===dateIST())&&(Math.abs(q.day??0)>=data.settings.price||(q.volume??0)>=data.settings.volume));
  const checks=await mapLimit(alerts,3,async row=>{
    const reasons=[];
    if(Math.abs(row.day??0)>=data.settings.price) reasons.push('Price crossed your threshold');
    if((row.volume??0)>=data.settings.volume) reasons.push('Volume crossed your threshold');
    if(data.mode==='demo'||todayOnly) return {...row,reasons,ratios:null,flags:[]};
    const annual=await statements(row.symbol,false).catch(()=>null);
    const ratios=annual?.ratios??null;
    const flags=[];
    if(ratios?.revenueGrowth<0) flags.push('Annual revenue declined');
    if(ratios?.netMargin<0) flags.push('The latest annual period showed a net loss');
    if(ratios?.returnOnEquity<0) flags.push('Return on equity was negative');
    return {...row,reasons,ratios,flags,fundamentalSource:annual?.source};
  });
  const priced=results.filter(r=>r.date&&(!todayOnly||r.date===dateIST()));
  return {alerts:checks,coverage:priced.length,total:results.length,asOf:priced.map(row=>row.date).sort().at(-1)??null};
}
const publicFiles={
  '/':'index.html','/app.js':'app.js','/styles.css':'styles.css','/sw.js':'sw.js',
  '/manifest.webmanifest':'manifest.webmanifest','/icon.svg':'icon.svg','/icon-192.png':'icon-192.png','/icon-512.png':'icon-512.png','/sample-holdings.csv':'sample-holdings.csv'
};
const mime={html:'text/html',js:'text/javascript',css:'text/css',webmanifest:'application/manifest+json',svg:'image/svg+xml',png:'image/png',csv:'text/csv'};
let push,calendar;
try{
  if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY&&process.env.VAPID_SUBJECT&&process.env.PUBLIC_ORIGIN?.startsWith('https://')){
    const candidate=(await import('web-push')).default;
    candidate.setVapidDetails(process.env.VAPID_SUBJECT,process.env.VAPID_PUBLIC_KEY,process.env.VAPID_PRIVATE_KEY);
    push=candidate;
  }
}catch(error){console.error('Push configuration:',error.message);}
try{
  if(process.env.NSE_CALENDAR||dateIST().startsWith('2026-')){
    const value=JSON.parse(await readFile(resolve(process.env.NSE_CALENDAR??resolve(root,'config/nse-2026.json')),'utf8'));
    const validDay=d=>/^\d{4}-\d{2}-\d{2}$/.test(d)&&d.startsWith(String(value.year)+'-')&&Number.isFinite(Date.parse(d));
    const validMinute=n=>Number.isInteger(n)&&n>=0&&n<1440;
    if(Number.isInteger(value.year)&&Array.isArray(value.holidays)&&value.holidays.length&&value.holidays.every(validDay)&&Object.entries(value.special??{}).every(([d,s])=>validDay(d)&&validMinute(s?.pre)&&validMinute(s?.post)&&s.pre+20<=s.post)) calendar=value;
  }
}catch(error){console.error('NSE calendar:',error.message);}
const calendarCurrent=()=>calendar?.year===Number(dateIST().slice(0,4));
const pushReady=()=>Boolean(push&&calendarCurrent());
function validateSubscription(value){
  const u=URL.parse(value?.endpoint??'');
  const approved=u?.hostname==='fcm.googleapis.com'||u?.hostname==='updates.push.services.mozilla.com'||u?.hostname==='web.push.apple.com'||u?.hostname.endsWith('.notify.windows.com');
  if(!u||u.protocol!=='https:'||u.port||u.username||u.password||!approved||typeof value?.keys?.p256dh!=='string'||typeof value?.keys?.auth!=='string'||u.href.length>2048) throw fail(400,'This browser push subscription is unsupported.');
}
async function route(req,res){
  const url=new URL(req.url,'http://localhost'), p=url.pathname, method=req.method;
  if(publicFiles[p]&&method==='GET'){
    const name=publicFiles[p], content=await readFile(resolve(root,'public',name));
    res.writeHead(200,{'Content-Type':mime[name.split('.').at(-1)],'Cache-Control':'no-cache'}); return res.end(content);
  }
  if(!p.startsWith('/api/')) throw fail(404,'Page not found.');
  if(method!=='GET'&&req.headers.origin){
    const origin=process.env.PUBLIC_ORIGIN||'http://'+req.headers.host;
    if(req.headers.origin!==origin) throw fail(403,'Origin check failed.');
  }
  if(method==='POST'&&['/api/register','/api/login'].includes(p)){
    limit('auth:'+req.socket.remoteAddress,20,600000);
    const input=await body(req);
    const email=String(input.email??'').trim().toLowerCase(), password=String(input.password??'');
    if(!/^\S+@\S+\.\S+$/.test(email)||email.length>200||password.length<8||password.length>128) throw fail(400,'Enter an email and a password with 8–128 characters.');
    let user=db.prepare('SELECT * FROM users WHERE email=?').get(email);
    if(p.endsWith('register')){
      if(user) throw fail(409,'This email already has an account.');
      const id=randomUUID(), salt=randomBytes(16).toString('hex'), key=await hashPassword(password,salt,64);
      try{db.prepare('INSERT INTO users VALUES(?,?,?,?,?)').run(id,email,salt,key.toString('hex'),JSON.stringify(initial()));}
      catch(error){if(error.errcode===2067) throw fail(409,'This email already has an account.');throw error;}
      user={id,email};
    }else{
      const key=await hashPassword(password,user?.salt??'00000000000000000000000000000000',64);
      if(!user||!timingSafeEqual(key,Buffer.from(user.password,'hex'))) throw fail(401,'Email or password is incorrect.');
    }
    const token=randomBytes(32).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES(?,?,?)').run(tokenHash(token),user.id,Date.now()+604800000);
    return json(res,200,{email:user.email},{'Set-Cookie':cookie(token,604800)});
  }
  if(method==='POST'&&p==='/api/logout'){
    const token=sessionToken(req);
    if(token) db.prepare('DELETE FROM sessions WHERE token=?').run(tokenHash(token));
    return json(res,200,{}, {'Set-Cookie':cookie('',0)});
  }
  const user=lookup(req);
  if(!user) throw fail(401,'Sign in to continue.');
  const data=JSON.parse(user.data);
  const mutate=fn=>{
    const current=JSON.parse(db.prepare('SELECT data FROM users WHERE id=?').get(user.id).data);
    fn(current);
    db.prepare('UPDATE users SET data=? WHERE id=?').run(JSON.stringify(current),user.id);
    return current;
  };
  if(method==='GET'){
    if(p==='/api/stocks'){
      limit('stocks:'+user.id,90,60000);
      const query=(url.searchParams.get('q')??'').trim();
      if(!query||query.length>100) throw fail(400,'Enter a company name, NSE ticker, or ISIN.');
      return json(res,200,await searchEquities(query));
    }
    if(p==='/api/state') return json(res,200,{email:user.email,...data,catalog,categories,push:{enabled:pushReady(),publicKey:pushReady()?process.env.VAPID_PUBLIC_KEY:null,reason:!push?'HTTPS and VAPID setup required.':!calendarCurrent()?'A verified calendar for the current NSE trading year is required.':null}});
    if(p==='/api/digest'){
      const hours=Number(url.searchParams.get('hours')??24);
      if(![24,48,72,168].includes(hours)) throw fail(400,'Choose a supported time window.');
      const refresh=url.searchParams.get('refresh')==='1';
      if(refresh)limit('digest:'+user.id,12,600000);
      return json(res,200,await digest(url.searchParams.get('live')==='1'?{...data,mode:'live'}:data,hours,refresh));
    }
    if(p==='/api/scan'){
      limit('scan:'+user.id,12,600000);
      return json(res,200,await scan(url.searchParams.get('live')==='1'?{...data,mode:'live'}:data,false,url.searchParams.get('refresh')==='1'));
    }
    if(p==='/api/filing-detail'){
      limit('filing-detail:'+user.id,25,600000);
      const feed=await digest({...data,mode:'live'},168);
      if(feed.error)throw fail(503,'NSE filings are temporarily unavailable.');
      const row=[...feed.owned,...feed.related,...feed.watch].find(f=>f.id===url.searchParams.get('id'));
      if(!row)throw fail(404,'This filing is outside your current briefing.');
      return json(res,200,await filingInsight(row));
    }
    if(p==='/api/sector'){
      limit('sector:'+user.id,24,600000);
      const sector=url.searchParams.get('name'), days=Number(url.searchParams.get('days'));
      const universe=catalog.filter(s=>s.sector===sector);
      if(!universe.length||![21,63,252].includes(days)) throw fail(400,'Choose a sector and time window.');
      const quotes=await mapLimit(universe,5,async stock=>({...stock,...await quote(stock.symbol,data.mode)}));
      const asOf=quotes.map(q=>q.date??'').sort().at(-1);
      const rows=quotes.filter(q=>q.date===asOf&&Number.isFinite(q.returns?.[days]?.latest))
        .map(q=>({...q,performance:q.returns[days].latest})).sort((a,b)=>b.performance-a.performance);
      return json(res,200,{asOf,mode:data.mode,rows,universe:universe.length,days});
    }
  }
  if(method==='POST'){
    const input=await body(req);
    if(p==='/api/preferences'){
      const s=input.settings, mode=input.mode;
      if(!['demo','live'].includes(mode)||!s||!(s.price>=.1&&s.price<=100)||!(s.volume>=1&&s.volume<=100)||!Array.isArray(s.types)||s.types.some(c=>!categories.includes(c))) throw fail(400,'Check the thresholds and selected alert types.');
      return json(res,200,mutate(d=>{d.mode=mode;d.settings={price:Number(s.price),volume:Number(s.volume),types:s.types,pre:s.pre===true,post:s.post===true,instant:s.instant===true};}));
    }
    if(p==='/api/import'){
      let rows;
      try{rows=csvHoldings(input.csv);}catch(error){throw fail(400,error.message);}
      return json(res,200,mutate(d=>{d.holdings=rows;}));
    }
    if(p==='/api/holding'){
      const symbol=symbolOf(input.symbol);
      return json(res,200,mutate(d=>{
        const prior=d.holdings.filter(h=>h.symbol!==symbol);
        if(input.remove===true){d.holdings=prior;return;}
        const quantity=Number(input.quantity),average=Number(input.average);
        if(!(quantity>0)||!Number.isFinite(quantity)||!Number.isFinite(average)||average<0||prior.length>=100) throw fail(400,'Use a positive quantity and a non-negative average cost.');
        const existing=d.holdings.find(h=>h.symbol===symbol);
        const purchaseDate=input.purchaseDate??existing?.purchaseDate;
        if(purchaseDate&&!validPurchaseDate(purchaseDate)) throw fail(400,'Enter a valid purchase date no later than today.');
        const name=typeof input.name==='string'?input.name.trim().slice(0,160):existing?.name;
        d.holdings=[...prior,{symbol,quantity,average,...(purchaseDate?{purchaseDate}:{}),...(name?{name}:{})}];
      }));
    }
    if(p==='/api/watch'){
      const symbol=symbolOf(input.symbol);
      return json(res,200,mutate(d=>{
        if(input.remove===true) d.watch=d.watch.filter(s=>s!==symbol);
        else if(!d.watch.includes(symbol)&&d.watch.length<100) d.watch.push(symbol);
      }));
    }
    if(p==='/api/research'){
      limit('research:'+user.id,16,600000);
      const symbol=symbolOf(input.symbol), report=await research(symbol,input.live===true?'live':data.mode);
      const draftId=randomUUID();
      db.prepare('DELETE FROM drafts WHERE expires<=?').run(Date.now());
      db.prepare('INSERT INTO drafts VALUES(?,?,?,?)').run(draftId,user.id,Date.now()+3600000,JSON.stringify(report));
      return json(res,200,{...report,draftId});
    }
    if(p==='/api/save-report'){
      const draft=db.prepare('SELECT data FROM drafts WHERE id=? AND owner=? AND expires>?').get(String(input.id??''),user.id,Date.now());
      if(!draft) throw fail(404,'Research snapshot expired. Run research again.');
      const snapshot={id:String(input.id),...JSON.parse(draft.data)};
      mutate(d=>{
        if(d.saved.some(r=>r.id===snapshot.id)) return;
        if(d.saved.length>=30) throw fail(409,'Remove a saved report first (limit 30).');
        d.saved.unshift(snapshot);
      });
      return json(res,200,snapshot);
    }
    if(p==='/api/recheck'||p==='/api/remove-report'){
      const saved=data.saved.find(r=>r.id===input.id);
      if(!saved) throw fail(404,'Saved report not found.');
      if(p.endsWith('remove-report')) return json(res,200,mutate(d=>{d.saved=d.saved.filter(r=>r.id!==saved.id);}));
      limit('research:'+user.id,16,600000);
      const next=await research(saved.symbol,saved.mode,true);
      return json(res,200,{next,diff:reportDiff(saved,next)});
    }
    if(p==='/api/subscription'){
      if(input.remove===true){
        db.prepare('DELETE FROM subscriptions WHERE owner=? AND endpoint=?').run(user.id,String(input.endpoint??''));
        return json(res,200,{});
      }
      if(!pushReady()) throw fail(503,'Server push is not configured.');
      validateSubscription(input);
      db.prepare('INSERT INTO subscriptions VALUES(?,?,?) ON CONFLICT(endpoint) DO UPDATE SET owner=excluded.owner,data=excluded.data').run(input.endpoint,user.id,JSON.stringify({endpoint:input.endpoint,keys:input.keys}));
      return json(res,200,{});
    }
  }
  throw fail(404,'Action not found.');
}
async function deliver(subscription,event,title,message){
  const claimed=db.prepare('INSERT OR IGNORE INTO deliveries VALUES(?,?,?)').run(subscription.endpoint,event,Date.now());
  if(!claimed.changes) return;
  try{
    await push.sendNotification(JSON.parse(subscription.data),JSON.stringify({title,body:message,url:'/#briefing'}),{TTL:900,timeout:9000});
  }catch(error){
    if([404,410].includes(error.statusCode)) db.prepare('DELETE FROM subscriptions WHERE endpoint=? AND owner=?').run(subscription.endpoint,subscription.owner);
    else db.prepare('DELETE FROM deliveries WHERE endpoint=? AND event=?').run(subscription.endpoint,event);
    console.error('Push delivery failed:',error.statusCode??error.message);
  }
}
let checking=false;
async function tick(){
  if(checking||!pushReady()) return;
  checking=true;
  try{
    const slot=briefingSlot(new Date(),calendar);
    const slots=new Map();
    db.prepare('DELETE FROM deliveries WHERE created<?').run(Date.now()-14*86400000);
    const subscribers=db.prepare('SELECT subscriptions.*,users.data AS preferences FROM subscriptions JOIN users ON owner=users.id').all();
    await mapLimit(subscribers,3,async subscription=>{
      const data={...JSON.parse(subscription.preferences),mode:'live'};
      if(slot?.slot==='post'&&data.settings.instant&&!data.settings.post){
        const key=slot.day+':eod-moves';
        if(!db.prepare('SELECT 1 FROM deliveries WHERE endpoint=? AND event=?').get(subscription.endpoint,key)){
          if(!slots.has(subscription.owner)) slots.set(subscription.owner,scan(data,true));
          const moves=await slots.get(subscription.owner);
          if(moves.alerts.length) await deliver(subscription,key,'FINN · EOD moves',moves.alerts.length+' holdings crossed your thresholds.');
        }
      }
      if(slot&&data.settings[slot.slot]){
        const key=slot.day+':'+slot.slot;
        if(!db.prepare('SELECT 1 FROM deliveries WHERE endpoint=? AND event=?').get(subscription.endpoint,key)){
          const report=await digest(data,24);
          if(slot.slot==='post'&&!slots.has(subscription.owner)) slots.set(subscription.owner,scan(data,true));
          const moves=slot.slot==='post'?await slots.get(subscription.owner):null;
          const summary=report.error?'NSE filings unavailable.':report.owned.length+' portfolio filings, '+report.owned.filter(r=>r.alert).length+' selected alerts.';
          await deliver(subscription,key,slot.slot==='pre'?'FINN · Before the open':'FINN · After the close',summary+(moves?' '+moves.alerts.length+' EOD moves flagged · '+moves.coverage+'/'+moves.total+' quotes.':''));
        }
      }
      if(data.settings.instant){
        const report=await digest(data,24);
        for(const filing of report.owned.filter(r=>r.alert&&r.timestamp>=Date.now()-15*60000)){
          await deliver(subscription,'filing:'+filing.id,'FINN · '+filing.symbol,filing.title);
        }
      }
    });
  }catch(error){console.error('Scheduler:',error.message);}
  finally{checking=false;}
}
const server=createServer((req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
  route(req,res).catch(error=>{
    if(!error.status) console.error(error);
    if(!res.headersSent) json(res,error.status??500,{error:error.status?error.message:'Something went wrong. Please try again.'});
    else res.end();
  });
});
server.listen(Number(process.env.PORT||4173),process.env.HOST||'127.0.0.1',()=>{
  console.log('FINN listening at http://'+(process.env.HOST||'127.0.0.1')+':'+server.address().port);
  if(pushReady()){setInterval(tick,60000).unref();void tick();}
});

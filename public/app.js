const main=document.querySelector('#main'), nav=document.querySelector('#nav'), notice=document.querySelector('#notice');
const logout=document.querySelector('#logout'), theme=document.querySelector('#theme'), install=document.querySelector('#install');
const themeKey='finn-theme';
document.documentElement.dataset.theme=localStorage.getItem(themeKey)??'dark';
theme.onclick=()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;localStorage.setItem(themeKey,next);
};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const format=(n,suffix='')=>Number.isFinite(n)?n.toLocaleString('en-IN',{maximumFractionDigits:2})+suffix:'—';
const when=value=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
const link=(url,label)=>/^https:\/\//.test(url??'')?'<a href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+'</a>':'';
const button=(label,attrs='',style='')=>'<button type="button" class="'+style+'" '+attrs+'>'+label+'</button>';
const tag=value=>'<span class="tag">'+escape(value)+'</span>';
const metric=(label,value)=>'<div class="metric"><small>'+escape(label)+'</small><strong>'+escape(value)+'</strong></div>';
const panel=(title,body)=>'<section class="panel"><h2>'+title+'</h2>'+body+'</section>';
const hero=(label,title,detail)=>'<section class="hero"><p class="eyebrow">'+label+' · '+(state.mode==='demo'?'Sample data':'Live feeds')+'</p><h1>'+title+'</h1><p class="muted">'+detail+'</p></section>';
let state, report, authMode='register', hours=24, timer, generation=0, installPrompt;
const section=()=>['briefing','portfolio','research','saved','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'briefing';
function notify(message){notice.textContent=message;clearTimeout(timer);timer=setTimeout(()=>notice.textContent='',5500);}
async function api(path,payload){
  const res=await fetch('/api/'+path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await res.json();
  if(!res.ok) throw Error(result.error);
  return result;
}
async function act(control,task){
  control.disabled=true;
  try{await task();}catch(error){notify(error.message);}
  finally{control.disabled=false;}
}
function auth(){
  nav.hidden=true; logout.hidden=true;
  main.innerHTML='<div class="auth"><div class="hero"><p class="eyebrow">YOUR NSE RESEARCH DESK</p><h1>Know what changed.</h1><p class="muted">Track portfolio filings, spot unusual moves, and research companies from primary sources.</p></div>'+panel(authMode==='register'?'Create your workspace':'Welcome back','<form id="auth"><div class="fields"><label>Email<input name="email" type="email" autocomplete="email" maxlength="200" required></label><label>Password<input name="password" type="password" autocomplete="'+(authMode==='register'?'new-password':'current-password')+'" minlength="8" maxlength="128" required></label></div><div class="actions"><button class="primary">'+(authMode==='register'?'Create account':'Sign in')+'</button>'+button(authMode==='register'?'I have an account':'Create an account','id="switch"')+'</div><p class="muted">Each new account starts with a private 18-stock sample portfolio.</p></form>')+'</div>';
  document.querySelector('#switch').onclick=()=>{authMode=authMode==='register'?'login':'register';auth();};
  document.querySelector('#auth').onsubmit=e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
    act(e.submitter,async()=>{await api(authMode,data);state=await api('state');render();});
  };
}
logout.onclick=()=>act(logout,async()=>{
  try{
    const registration=await navigator.serviceWorker?.getRegistration();
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription){await api('subscription',{remove:true,endpoint:subscription.endpoint});await subscription.unsubscribe();}
  }catch(error){notify('Push cleanup failed: '+error.message);return;}
  await api('logout',{});state=null;report=null;render();
});
function render(){
  const id=++generation;
  main.setAttribute('aria-busy','false');
  if(!state){auth();return;}
  nav.hidden=false;logout.hidden=false;
  const name=section();
  for(const anchor of nav.querySelectorAll('a')) anchor.setAttribute('aria-current',anchor.hash==='#'+name?'page':'false');
  ({briefing,portfolio,research,saved,settings}[name])(id);
}
function article(row){
  return '<article class="row"><div class="row-head">'+tag(row.symbol)+'<small>'+escape(when(row.timestamp))+'</small></div><h3>'+escape(row.title)+'</h3><p class="muted">'+escape(row.detail)+'</p><p><strong>Why it matters</strong> · '+escape(row.why)+'</p><small>'+escape(row.category)+' '+link(row.url,'Open filing ↗')+'</small></article>';
}
function briefing(id){
  main.innerHTML=hero('01 / Push','Your briefing','See what changed across your holdings, with routine filings grouped separately.')+
    '<div class="grid">'+panel('Portfolio filings','<div class="controls"><label for="window">Lookback</label><select id="window">'+[24,48,72,168].map(h=>'<option '+(h===hours?'selected':'')+' value="'+h+'">'+h+' hours</option>').join('')+'</select></div><div id="filings"><p class="muted">Loading filings…</p></div>')+
    panel('Unusual moves','<p class="muted">Completed sessions only. Price ±'+state.settings.price+'% or volume ≥ '+state.settings.volume+'× the previous 20 sessions.</p>'+button('Scan holdings','id="scan"','primary')+'<div id="moves"></div>')+'</div>'+
    panel('Sector & peer filings','<div id="related"><p class="muted">Loading related filings…</p></div>');
  document.querySelector('#window').onchange=e=>{hours=Number(e.target.value);render();};
  api('digest?hours='+hours).then(data=>{
    if(id!==generation)return;
    const important=data.owned.filter(r=>r.category!=='Routine'), routine=data.owned.filter(r=>r.category==='Routine');
    document.querySelector('#filings').innerHTML='<p class="muted">'+escape(data.scope)+'</p>'+(data.error?'<p class="error">'+escape(data.error)+'</p>':
      '<p>'+data.owned.length+' filings · '+data.owned.filter(r=>r.alert).length+' selected alerts</p>'+(important.map(article).join('')||'<p class="muted">No material portfolio filings in this window.</p>')+
      (routine.length?'<details><summary>Routine filings ('+routine.length+')</summary>'+routine.map(article).join('')+'</details>':''));
    document.querySelector('#related').innerHTML=data.error?'<p class="muted">Peer context is unavailable with the filing feed.</p>':data.related.map(article).join('')||'<p class="muted">No material filings from non-holding peers in the tracked sectors.</p>';
  }).catch(error=>{if(id===generation)document.querySelector('#filings').textContent=error.message;});
  document.querySelector('#scan').onclick=e=>act(e.target,async()=>{
    const moves=document.querySelector('#moves');moves.textContent='Checking price and volume…';
    try{
      const scan=await api('scan');
      if(id!==generation)return;
      moves.innerHTML='<p class="muted">'+scan.coverage+' of '+scan.total+' holdings priced.</p>'+(scan.alerts.map(a=>'<article class="row"><h3>'+escape(a.symbol)+'</h3><p>'+format(a.day,'%')+' · '+format(a.volume,'×')+' · '+escape(a.date)+'</p><p>'+escape(a.reasons.join(' · '))+'</p><p class="muted">'+escape(a.ratios?a.flags.join(' · ')||'No negative readings in the available annual checks.':'Annual financial checks unavailable.')+' '+link(a.fundamentalSource,'Annual filing ↗')+'</p>'+button('Research','data-research="'+escape(a.symbol)+'"')+'</article>').join('')||'<p class="muted">'+(scan.coverage?'No thresholds crossed in the available data.':'Price data unavailable.')+'</p>');
    }catch(error){moves.textContent=error.message;}
  });
}
function portfolio(){
  const stock=symbol=>state.catalog.find(s=>s.symbol===symbol);
  const sectors=[...new Set(state.holdings.map(h=>stock(h.symbol)?.sector).filter(Boolean))];
  const total=state.holdings.reduce((sum,h)=>sum+h.quantity*h.average,0);
  main.innerHTML=hero('02 / Monitor','Your portfolio','Edit holdings, track exposure at cost, or import a new holdings list.')+
    '<div class="metrics">'+metric('Holdings',state.holdings.length)+metric('Known sectors',sectors.length)+metric('Total cost basis',money.format(total))+'</div>'+
    panel('Holdings','<div class="table-wrap"><table><thead><tr><th>Company</th><th>Sector</th><th>Demo size band</th><th>Qty</th><th>Avg. cost</th><th></th></tr></thead><tbody>'+state.holdings.map(h=>'<tr><td>'+button(escape(h.symbol),'data-research="'+escape(h.symbol)+'"')+'</td><td>'+escape(stock(h.symbol)?.sector??'—')+'</td><td>'+escape(stock(h.symbol)?.cap??'—')+'</td><td>'+format(h.quantity)+'</td><td>'+money.format(h.average)+'</td><td>'+button('Edit','data-edit="'+escape(h.symbol)+'"')+'</td></tr>').join('')+'</tbody></table></div>')+
    '<div class="grid">'+panel('Add or edit holding','<form id="holding"><div class="fields"><label>Symbol<input name="symbol" maxlength="24" required placeholder="e.g. INFY"></label><label>Quantity<input name="quantity" type="number" min="0.000001" step="any" required></label><label>Average cost (₹)<input name="average" type="number" min="0" step="any" required></label></div><div class="actions"><button class="primary">Save holding</button>'+button('Remove selected','id="remove-holding"')+'</div></form>')+
    panel('Import holdings','<form id="import"><p class="muted">Import replaces the holdings in this account. Use NSE symbols and INR average cost.</p><label>Holdings CSV<input type="file" accept=".csv,text/csv" required></label><div class="actions"><button class="primary">Replace holdings</button><a href="/sample-holdings.csv" download>Sample CSV</a></div></form>')+'</div>';
  const form=document.querySelector('#holding');
  main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const h=state.holdings.find(h=>h.symbol===b.dataset.edit);
    for(const key of ['symbol','quantity','average'])form.elements[key].value=h[key];
    form.elements.quantity.focus();
  });
  form.onsubmit=e=>{e.preventDefault();act(e.submitter,async()=>{Object.assign(state,await api('holding',Object.fromEntries(new FormData(form))));render();notify('Holding saved.');});};
  document.querySelector('#remove-holding').onclick=e=>act(e.target,async()=>{Object.assign(state,await api('holding',{symbol:form.elements.symbol.value,remove:true}));render();notify('Holding removed.');});
  document.querySelector('#import').onsubmit=e=>{
    e.preventDefault();const file=e.target.querySelector('input').files[0];
    if(!file||file.size>125000){notify('Choose a CSV smaller than 125 KB.');return;}
    if(!confirm('Replace all current holdings with this CSV?'))return;
    act(e.submitter,async()=>{Object.assign(state,await api('import',{csv:await file.text()}));render();notify('Portfolio imported.');});
  };
}
function reportHTML(r){
  const returns=r.price.returns;
  const inr=r.annual?.currency==='INR';
  const units=inr?'₹ crore':'USD million', divisor=inr?10000000:1000000;
  return '<div class="row-head"><h2>'+escape(r.symbol)+' research</h2>'+tag(r.mode==='demo'?'Sample prices':'Live request')+'</div>'+
    '<p class="muted">Completed session '+escape(r.price.date??'unavailable')+' '+link(r.price.source,'Price history ↗')+'</p>'+
    (r.price.error?'<p class="error">'+escape(r.price.error)+'</p>':'')+
    '<div class="metrics">'+metric('Close',Number.isFinite(r.price.close)?money.format(r.price.close):'—')+metric('Daily adjusted return',format(r.price.day,'%'))+metric('Volume / 20-session mean',format(r.price.volume,'×'))+'</div>'+
    (returns?'<div class="table-wrap"><table><thead><tr><th>Window</th><th>Latest return</th><th>Median rolling</th><th>Observations</th></tr></thead><tbody>'+Object.entries(returns).map(([n,v])=>'<tr><td>'+n+' sessions</td><td>'+format(v.latest,'%')+'</td><td>'+format(v.median,'%')+'</td><td>'+v.observations+'</td></tr>').join('')+'</tbody></table></div>':'')+
    '<div class="row"><h3>Annual fundamentals</h3>'+(r.annual?'<p class="muted">IFRS figures from the annual filing through '+escape(r.annual.years[0].end)+'. '+link(r.annual.source,'Annual filing ↗')+'</p><div class="metrics">'+metric('Annual revenue ('+units+')',format(Number.isFinite(r.annual.years[0].revenue)?r.annual.years[0].revenue/divisor:null))+metric('Annual profit ('+units+')',format(Number.isFinite(r.annual.years[0].income)?r.annual.years[0].income/divisor:null))+metric('Revenue growth',format(r.annual.ratios.revenueGrowth,'%'))+metric('Profit margin',format(r.annual.ratios.netMargin,'%'))+metric('Return on equity',format(r.annual.ratios.returnOnEquity,'%'))+'</div>':'<p class="muted">No comparable annual financial facts available in this run.</p>')+'</div>'+
    '<div class="row"><h3>What management says</h3><p class="muted">'+escape(r.aiStatus)+'</p>'+(r.narrative?'<p class="preline">'+escape(r.narrative)+'</p>':'')+'</div>'+
    '<div class="row"><h3>Primary documents</h3>'+(r.sources.map((s,i)=>'<p>['+(i+1)+'] '+link(s.url,s.label)+' · <small>'+escape(s.status)+'</small></p>').join('')||'<p class="muted">No annual report or earnings-call transcript returned.</p>')+'</div>';
}
function research(id){
  const sectors=[...new Set(state.catalog.map(s=>s.sector))].sort();
  main.innerHTML=hero('03 / Pull','Research desk','Look up an NSE company, compare performance, and save a report you can recheck later.')+
    '<div class="grid">'+panel('Company search','<form id="research"><label>Company name or NSE ticker<input name="symbol" list="companies" placeholder="e.g. Infosys or INFY" maxlength="80" value="'+escape(report?.symbol??'')+'" required></label><datalist id="companies">'+state.catalog.map(s=>'<option value="'+escape(s.symbol)+'">'+escape(s.name)+'</option>').join('')+'</datalist><p class="muted">Any valid NSE symbol. Data coverage varies by issuer.</p><button class="primary">Run research</button></form><p class="eyebrow">Demo tickers</p><div class="chips">'+state.catalog.filter(s=>s.demo).map(s=>button(s.symbol,'data-research="'+s.symbol+'"')).join('')+'</div>')+
    panel('Sector leaders','<form id="sector"><div class="fields"><label>Sector<select name="name">'+sectors.map(s=>'<option>'+escape(s)+'</option>').join('')+'</select></label><label>Window<select name="days"><option value="21">21 sessions</option><option value="63" selected>63 sessions</option><option value="252">252 sessions</option></select></label></div><button>Rank tracked stocks</button></form><div id="leaders"></div>')+'</div>'+
    '<section class="panel" id="report" '+(report?'':'hidden')+'>'+ (report?reportHTML(report)+ '<div class="actions">'+button('Save report','id="save"','primary')+button(state.watch.includes(report.symbol)?'Remove from watchlist':'Add to watchlist','data-watch="'+escape(report.symbol)+'"')+'</div>':'')+'</section>';
  document.querySelector('#research').onsubmit=e=>{
    e.preventDefault();const value=e.target.elements.symbol.value.trim();
    const symbol=state.catalog.find(s=>s.name.toLowerCase()===value.toLowerCase())?.symbol??value;
    void runResearch(symbol,e.submitter);
  };
  document.querySelector('#sector').onsubmit=e=>{
    e.preventDefault();const params=new URLSearchParams(new FormData(e.target));
    act(e.submitter,async()=>{
      const target=document.querySelector('#leaders');target.textContent='Loading sector quotes…';
      try{
        const data=await api('sector?'+params);
        if(id!==generation)return;
        target.innerHTML='<p class="muted">'+data.rows.length+' of '+data.universe+' tracked stocks · '+data.days+'-session adjusted close return · '+escape(data.asOf||'no completed session')+'</p>'+
          (data.rows.map((s,i)=>'<div class="row row-head"><span>'+(i+1)+'. '+button(s.symbol,'data-research="'+s.symbol+'"')+'</span><strong>'+format(s.performance,'%')+'</strong></div>').join('')||'<p class="muted">No comparable quotes returned.</p>');
      }catch(error){target.textContent=error.message;}
    });
  };
  const save=document.querySelector('#save');
  if(save)save.onclick=()=>act(save,async()=>{
    const saved=await api('save-report',{id:report.draftId??report.id});
    if(!state.saved.some(r=>r.id===saved.id))state.saved.unshift(saved);
    notify('Report saved.');
  });
}
async function runResearch(symbol,control){
  if(!state)return;
  if(section()!=='research'){location.hash='research';}
  const current=state;
  await act(control,async()=>{
    notify('Researching '+symbol.toUpperCase()+'…');
    const result=await api('research',{symbol});
    if(state!==current||section()!=='research')return;
    report=result;render();document.querySelector('#report')?.scrollIntoView({block:'start'});notify('Research ready.');
  });
}
function saved(){
  main.innerHTML=hero('04 / Recheck','Saved intelligence','Keep watch on companies and compare a fresh report against a saved snapshot.')+
    '<div class="grid">'+panel('Saved reports',state.saved.map(r=>'<article class="row"><div class="row-head"><h3>'+escape(r.symbol)+'</h3>'+tag(r.mode)+'</div><p class="muted">'+escape(when(r.createdAt))+'</p><details><summary>Open snapshot</summary>'+reportHTML(r)+'</details><div class="actions">'+button('Recheck sources','data-recheck="'+r.id+'"','primary')+button('Delete','data-delete="'+r.id+'"')+'</div><div id="diff-'+r.id+'"></div></article>').join('')||'<p class="muted">Run company research and save your first snapshot.</p>')+
    panel('Watchlist',state.watch.map(s=>'<div class="row row-head">'+button(escape(s),'data-research="'+escape(s)+'"')+button('Remove','data-watch="'+escape(s)+'"')+'</div>').join('')||'<p class="muted">Add a company from its research view.</p>')+'</div>';
}
function settings(){
  const s=state.settings;
  const check=(name,label,enabled)=>'<label class="check"><input name="'+escape(name)+'" type="checkbox" '+(enabled?'checked':'')+'>'+escape(label)+'</label>';
  main.innerHTML=hero('05 / Configure','Your settings','Choose the feed, tune what counts as unusual, and manage browser notifications.')+
    panel('Feeds & alert rules','<form id="prefs"><div class="fields"><label>Data mode<select name="mode"><option value="demo">Sample data</option><option value="live" '+(state.mode==='live'?'selected':'')+'>Live providers</option></select></label><label>Daily price move (%)<input name="price" type="number" min=".1" max="100" step=".1" value="'+s.price+'" required></label><label>Volume multiple<input name="volume" type="number" min="1" max="100" step=".1" value="'+s.volume+'" required></label></div><div class="chips">'+state.categories.filter(c=>c!=='Routine').map(c=>check(c,c,s.types.includes(c))).join('')+'</div><details open><summary>Notification schedule · India time</summary>'+check('pre','08:55 before market open',s.pre)+check('post','16:00 after market close',s.post)+check('instant','Material filings as detected and EOD threshold alerts',s.instant)+'</details><button class="primary">Save preferences</button></form>')+
    panel('Device notifications','<p class="muted">'+escape(state.push.enabled?'Notifications use live mode, the NSE trading calendar, and this device’s browser permission.':state.push.reason)+'</p><div class="actions">'+button('Enable on this device','id="subscribe" '+(!state.push.enabled?'disabled':''),'primary')+button('Disable on this device','id="unsubscribe"')+'</div><p class="muted">Install from the browser menu or Add to Home Screen on iPhone. Push support depends on browser and OS.</p>');
  document.querySelector('#prefs').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);
    act(e.submitter,async()=>{
      const payload={mode:f.get('mode'),settings:{price:Number(f.get('price')),volume:Number(f.get('volume')),types:state.categories.filter(c=>f.has(c)),pre:f.has('pre'),post:f.has('post'),instant:f.has('instant')}};
      if(payload.mode!==state.mode)report=null;
      Object.assign(state,await api('preferences',payload));render();notify('Preferences saved.');
    });
  };
  document.querySelector('#subscribe').onclick=e=>act(e.target,async()=>{
    if(!window.isSecureContext||!('PushManager' in window)||!('Notification' in window))throw Error('Push is unavailable in this browser or context.');
    if(await Notification.requestPermission()!=='granted')throw Error('Notification permission was not granted.');
    const reg=await navigator.serviceWorker.ready;
    const encoded=state.push.publicKey.replace(/-/g,'+').replace(/_/g,'/');
    const key=Uint8Array.from(atob(encoded.padEnd(Math.ceil(encoded.length/4)*4,'=')),c=>c.charCodeAt(0));
    const sub=await reg.pushManager.getSubscription()??await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
    await api('subscription',sub.toJSON());notify('Notifications enabled on this device.');
  });
  document.querySelector('#unsubscribe').onclick=e=>act(e.target,async()=>{
    const reg=await navigator.serviceWorker?.getRegistration(), sub=await reg?.pushManager.getSubscription();
    if(sub){await api('subscription',{endpoint:sub.endpoint,remove:true});await sub.unsubscribe();}
    notify('Device notifications disabled.');
  });
}
main.addEventListener('click',e=>{
  const control=e.target.closest('button');
  if(!control||!state)return;
  const d=control.dataset;
  if(d.research)void runResearch(d.research,control);
  if(d.watch)act(control,async()=>{Object.assign(state,await api('watch',{symbol:d.watch,remove:state.watch.includes(d.watch)}));render();});
  if(d.delete)act(control,async()=>{Object.assign(state,await api('remove-report',{id:d.delete}));render();});
  if(d.recheck)act(control,async()=>{
    const target=document.querySelector('#diff-'+d.recheck);target.textContent='Checking latest available sources…';
    try{
      const {diff,next}=await api('recheck',{id:d.recheck});
      target.innerHTML='<p class="muted">Checked '+escape(when(next.createdAt))+'</p>'+(diff.map(x=>'<p><strong>'+escape(x.label)+'</strong> · '+escape(typeof x.before==='number'?format(x.before):x.before)+' → '+escape(typeof x.after==='number'?format(x.after):x.after)+'</p>').join('')||'<p>No change detected in comparable fields.</p>')+'<details><summary>View fresh report</summary>'+reportHTML(next)+'</details>';
    }catch(error){target.textContent=error.message;}
  });
});
window.addEventListener('hashchange',render);
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;install.hidden=false;});
window.addEventListener('appinstalled',()=>{install.hidden=true;installPrompt=null;});
install.onclick=async()=>{await installPrompt?.prompt();install.hidden=true;installPrompt=null;};
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
try{state=await api('state');}catch(error){if(error.message!=='Sign in to continue.')notify(error.message);}
render();



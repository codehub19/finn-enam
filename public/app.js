const main=document.querySelector('#main'), nav=document.querySelector('#nav'), notice=document.querySelector('#notice');
const logout=document.querySelector('#logout'), theme=document.querySelector('#theme'), install=document.querySelector('#install');
const themeKey='finn-theme';
document.documentElement.dataset.theme=localStorage.getItem(themeKey)??'dark';
theme.onclick=()=>{
  const next=document.documentElement.dataset.theme==='dark'?'light':'dark';
  document.documentElement.dataset.theme=next;localStorage.setItem(themeKey,next);
};
const escape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const strokes={
  pulse:'M2 12h4l3-7 4 14 3-7h6',
  folio:'M3 9 12 4l9 5-9 5-9-5Zm0 5 9 5 9-5',
  search:'M15.5 15.5 21 21M10 17a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z',
  mark:'M6 4h12v16l-6-4-6 4V4Z',
  tune:'M4 6h16M4 12h16M4 18h16M8 4v4m8 2v4m-6 2v4',
  arrow:'M5 12h14m-5-5 5 5-5 5',
  plus:'M12 5v14M5 12h14',
  theme:'M12 3v18m0-18a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z'
};
const icon=name=>'<svg class="glyph" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+strokes[name]+'"/></svg>';
const sectionIcons={briefing:'pulse',portfolio:'folio',research:'search',saved:'mark',settings:'tune'};
for(const a of nav.querySelectorAll('a'))a.insertAdjacentHTML('afterbegin',icon(sectionIcons[a.hash.slice(1)]));
theme.insertAdjacentHTML('afterbegin',icon('theme'));
const money=new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:2});
const format=(n,suffix='')=>Number.isFinite(n)?n.toLocaleString('en-IN',{maximumFractionDigits:2})+suffix:'—';
const when=value=>new Date(value).toLocaleString('en-IN',{timeZone:'Asia/Kolkata',dateStyle:'medium',timeStyle:'short'});
const link=(url,label)=>/^https:\/\//.test(url??'')?'<a href="'+escape(url)+'" target="_blank" rel="noopener noreferrer">'+escape(label)+'</a>':'';
const button=(label,attrs='',style='')=>'<button type="button" class="'+style+'" '+attrs+'>'+label+'</button>';
const tag=value=>'<span class="tag">'+escape(value)+'</span>';
const metric=(label,value)=>'<div class="metric"><small>'+escape(label)+'</small><strong>'+escape(value)+'</strong></div>';
const panel=(title,body)=>'<section class="panel"><h2>'+title+'</h2>'+body+'</section>';
const hero=(label,title,detail)=>'<section class="page-heading"><h1>'+title+'</h1><p class="muted">'+detail+'</p></section>';
const loading=(label,detail='')=>'<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><div><strong>'+escape(label)+'</strong>'+(detail?'<p class="muted">'+escape(detail)+'</p>':'')+'</div></div>';
let state, report, researchPending, authMode='register', hours=24, timer, generation=0, installPrompt, researchSequence=0;
const section=()=>['briefing','portfolio','research','saved','settings'].includes(location.hash.slice(1))?location.hash.slice(1):'briefing';
function notify(message){notice.textContent=message;clearTimeout(timer);timer=setTimeout(()=>notice.textContent='',5500);}
async function api(path,payload){
  const res=await fetch('/api/'+path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await res.json();
  if(!res.ok) throw Error(result.error);
  return result;
}
async function act(control,task){
  const original=[...control.childNodes];
  const pending=control.tagName==='BUTTON';
  control.disabled=true;
  control.setAttribute('aria-busy','true');
  if(pending)control.textContent=control.dataset.pending??'Working…';
  try{await task();}catch(error){notify(error.message);}
  finally{control.disabled=false;control.removeAttribute('aria-busy');if(pending)control.replaceChildren(...original);}
}
function stockPicker(id){
  return '<div class="stock-picker"><label for="'+id+'">Find an NSE company</label><div class="stock-input">'+icon('search')+
    '<input id="'+id+'" type="search" maxlength="100" autocomplete="off" placeholder="Company, ticker or ISIN" aria-describedby="'+id+'-status"></div>'+
    '<p id="'+id+'-status" class="muted picker-status" role="status">Search the NSE equity directory.</p>'+
    '<div id="'+id+'-results" class="stock-results" role="group" aria-label="Matching companies" hidden></div></div>';
}
function bindPicker(id,onSelect,onClear=()=>{}){
  const input=document.getElementById(id), status=document.getElementById(id+'-status'), list=document.getElementById(id+'-results');
  let delay, revision=0;
  function reset(){
    ++revision;
    clearTimeout(delay);
    list.hidden=true;
    list.replaceChildren();
  }
  input.addEventListener('input',()=>{
    reset();
    onClear();
    const query=input.value.trim();
    if(!query){status.textContent='Search the NSE equity directory.';return;}
    status.textContent='Looking up companies…';
    const current=revision;
    delay=setTimeout(async()=>{
      try{
        const data=await api('stocks?q='+encodeURIComponent(query));
        if(current!==revision||!input.isConnected)return;
        const source={live:'NSE equity directory',cached:'Last available NSE directory',sample:'NSE unavailable · sample companies only'}[data.status];
        status.textContent=source+' · '+(data.results.length?data.results.length+' matches shown':'No matches');
        for(const stock of data.results){
          const control=document.createElement('button');
          control.type='button';
          control.className='stock-option';
          control.innerHTML='<span class="stock-badge">'+escape(stock.symbol.slice(0,2))+'</span><span class="stock-copy"><strong>'+escape(stock.symbol)+'</strong><small>'+escape(stock.name)+'</small></span><span class="exchange">'+escape(stock.exchange)+'</span>'+icon('arrow');
          control.onclick=()=>{
            input.value=stock.symbol;
            status.textContent=stock.name+' · '+stock.exchange;
            reset();
            onSelect(stock,input);
          };
          list.append(control);
        }
        list.hidden=!data.results.length;
      }catch(error){if(current===revision&&input.isConnected)status.textContent=error.message;}
    },260);
  });
  input.addEventListener('keydown',e=>{
    if(e.key==='Escape'){reset();status.textContent='Search results closed.';}
    if(e.key==='ArrowDown'&&!list.hidden){e.preventDefault();list.firstElementChild?.focus();}
    if(e.key==='Enter'){e.preventDefault();list.firstElementChild?.click();}
  });
  list.addEventListener('keydown',e=>{
    if(e.key==='Escape'){reset();input.focus();return;}
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
      e.preventDefault();
      const next=e.key==='ArrowDown'?e.target.nextElementSibling:e.target.previousElementSibling??input;
      next?.focus();
    }
  });
  return {input,reset,status};
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
  await api('logout',{});state=null;report=null;researchPending=null;render();
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
  const canExpand=['Results','Management'].includes(row.category);
  return '<article class="row"><div class="row-head">'+tag(row.symbol)+'<small>'+escape(when(row.timestamp))+'</small></div><h3>'+escape(row.title)+'</h3><p class="muted">'+escape(row.detail)+'</p><p><strong>Why it matters</strong> · '+escape(row.why)+'</p><div class="actions">'+(canExpand?button(row.category==='Results'?'See reported figures':'See leadership context','data-filing="'+escape(row.id)+'"'):'')+'<small>'+escape(row.category)+' '+link(row.url,'Original filing ↗')+'</small></div><div class="filing-detail"></div></article>';
}
function briefing(id){
  main.innerHTML=hero('','Briefing','Live NSE filings and completed-session moves for your portfolio.')+
    '<div class="brief-toolbar"><div class="controls"><label for="window">Lookback</label><select id="window">'+[24,48,72,168].map(h=>'<option '+(h===hours?'selected':'')+' value="'+h+'">'+h+' hours</option>').join('')+'</select></div>'+button('Run live briefing','id="run-brief" data-pending="Running briefing…"','primary')+'</div><div id="brief-status" aria-live="polite"></div>'+
    '<div class="grid">'+panel('Portfolio filings','<div id="filings"></div>')+
    panel('Unusual moves','<p class="muted">Price ±'+state.settings.price+'% or volume ≥ '+state.settings.volume+'× the previous 20 sessions.</p>'+button('Check price and volume','id="scan" data-pending="Checking holdings…"')+'<div id="moves"></div>')+'</div>'+
    panel('Watchlist and sector peers','<div id="related"></div>');
  const windowSelect=document.querySelector('#window'), run=document.querySelector('#run-brief'), scanButton=document.querySelector('#scan');
  const filings=document.querySelector('#filings'), related=document.querySelector('#related'), moves=document.querySelector('#moves'), status=document.querySelector('#brief-status');
  let revision=0;
  async function loadFilings(refresh){
    const request=++revision;
    filings.innerHTML=loading('Checking NSE filings…','Reviewing portfolio announcements for the selected window.');
    related.textContent='';
    try{
      const data=await api('digest?live=1&hours='+hours+(refresh?'&refresh=1':''));
      if(id!==generation||request!==revision)return;
      if(data.error){filings.innerHTML='<p class="error">NSE filings are unavailable right now. Try running the briefing again.</p>';return;}
      const important=data.owned.filter(r=>r.category!=='Routine'), routine=data.owned.filter(r=>r.category==='Routine');
      filings.innerHTML='<p class="muted">'+data.owned.length+' filings · '+data.owned.filter(r=>r.alert).length+' selected alerts · Checked '+escape(when(data.checkedAt))+'</p>'+
        (important.map(article).join('')||'<p class="muted">No material portfolio filings in this window. You can widen the lookback above.</p>')+
        (routine.length?'<details><summary>Routine filings ('+routine.length+')</summary>'+routine.map(article).join('')+'</details>':'');
      const peers=data.related.filter(row=>!data.watch.some(item=>item.id===row.id));
      related.innerHTML=(data.watch.length?'<h3>Watchlist</h3>'+data.watch.map(article).join(''):'')+
        (peers.length?'<details><summary>Sector peers ('+peers.length+')</summary>'+peers.map(article).join('')+'</details>':'')||
        '<p class="muted">No material filings for tracked peers or watchlist companies in this window.</p>';
    }catch(error){if(id===generation&&request===revision)filings.textContent=error.message;}
  }
  async function loadMoves(refresh){
    moves.innerHTML=loading('Checking price and volume…','Comparing completed trading sessions.');
    try{
      const scan=await api('scan?live=1'+(refresh?'&refresh=1':''));
      if(id!==generation)return;
      moves.innerHTML='<p class="muted">'+scan.coverage+' of '+scan.total+' holdings priced'+(scan.asOf?' · Latest session '+escape(scan.asOf):'')+'.</p>'+(scan.alerts.map(a=>'<article class="row"><h3>'+escape(a.symbol)+'</h3><p>'+format(a.day,'%')+' · '+format(a.volume,'×')+' · '+escape(a.date)+'</p><p>'+escape(a.reasons.join(' · '))+'</p><p class="muted">'+escape(a.ratios?a.flags.join(' · ')||'No negative readings in the available annual checks.':'Annual financial checks unavailable.')+' '+link(a.fundamentalSource,'Annual filing ↗')+'</p>'+button('Research','data-research="'+escape(a.symbol)+'" data-live="1"')+'</article>').join('')||'<p class="muted">'+(scan.coverage?'No thresholds crossed in the available data.':'Price data unavailable.')+'</p>');
    }catch(error){moves.textContent=error.message;}
  }
  windowSelect.onchange=e=>{hours=Number(e.target.value);void loadFilings(false);};
  scanButton.onclick=()=>act(scanButton,async()=>{run.disabled=true;try{await loadMoves(true);}finally{run.disabled=false;}});
  run.onclick=()=>act(run,async()=>{
    scanButton.disabled=true;
    windowSelect.disabled=true;
    status.innerHTML=loading('Building your live briefing…','Filings and price checks will appear as they finish.');
    try{await Promise.all([loadFilings(true),loadMoves(true)]);}
    finally{status.replaceChildren();scanButton.disabled=false;windowSelect.disabled=false;}
  });
  void loadFilings(false);
}
function portfolio(){
  const stock=symbol=>state.catalog.find(s=>s.symbol===symbol);
  const sectors=[...new Set(state.holdings.map(h=>stock(h.symbol)?.sector).filter(Boolean))];
  const total=state.holdings.reduce((sum,h)=>sum+h.quantity*h.average,0);
  const allocation=new Map();
  for(const h of state.holdings){
    const sector=stock(h.symbol)?.sector??'Unclassified';
    allocation.set(sector,(allocation.get(sector)??0)+h.quantity*h.average);
  }
  const allocationRows=[...allocation].filter(([,cost])=>cost>0).sort((a,b)=>b[1]-a[1]).map(([sector,cost])=>{
    const share=100*cost/total;
    return '<div class="allocation-row"><div class="row-head"><small>'+escape(sector)+'</small><strong>'+format(share,'%')+'</strong></div><meter min="0" max="100" value="'+share+'" aria-label="'+escape(sector)+' share of cost basis">'+format(share,'%')+'</meter></div>';
  }).join('');
  main.innerHTML=hero('02 / Monitor','Your portfolio','Edit holdings, track exposure at cost, or import a new holdings list.')+
    '<div class="metrics">'+metric('Holdings',state.holdings.length)+metric('Known sectors',sectors.length)+metric('Total cost basis',money.format(total))+'</div>'+
    '<div class="grid">'+panel('Add or edit holding','<form id="holding">'+stockPicker('holding-search')+'<div class="fields"><label>Quantity<input name="quantity" type="number" min="0.000001" step="any" required></label><label>Average cost (₹)<input name="average" type="number" min="0" step="any" required></label><label>Purchase date<input name="purchaseDate" type="date" min="1900-01-01"></label></div><div class="actions"><button class="primary">'+icon('plus')+' Save holding</button>'+button('Remove selected','id="remove-holding" hidden')+'</div></form>')+
    panel('Import holdings','<form id="import"><p class="muted">Replace your holdings with an NSE portfolio CSV. The purchase_date column is optional.</p><label>Holdings CSV<input type="file" accept=".csv,text/csv" required></label><div class="actions"><button class="primary">Replace holdings</button><a href="/sample-holdings.csv" download>Sample CSV</a></div></form>')+'</div>'+
    panel('Allocation at cost','<div class="allocation">'+(allocationRows||'<p class="muted">Add holdings with a purchase cost to see sector allocation.</p>')+'</div>')+
    panel('Holdings','<div class="table-wrap"><table><thead><tr><th>Company</th><th>Sector</th><th>Demo size band</th><th>Qty</th><th>Avg. cost</th><th>Purchased</th><th></th></tr></thead><tbody>'+state.holdings.map(h=>'<tr><td>'+button(escape(h.symbol),'data-research="'+escape(h.symbol)+'"')+'<small class="holding-name">'+escape(h.name??stock(h.symbol)?.name??'')+'</small></td><td>'+escape(stock(h.symbol)?.sector??'—')+'</td><td>'+escape(stock(h.symbol)?.cap??'—')+'</td><td>'+format(h.quantity)+'</td><td>'+money.format(h.average)+'</td><td>'+escape(h.purchaseDate??'—')+'</td><td>'+button('Edit','data-edit="'+escape(h.symbol)+'"')+'</td></tr>').join('')+'</tbody></table></div>');
  const form=document.querySelector('#holding');
  const remove=document.querySelector('#remove-holding');
  let selected;
  form.elements.purchaseDate.max=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata'}).format(new Date());
  function selectHolding(company){
    selected=company;
    const h=state.holdings.find(h=>h.symbol===company.symbol);
    for(const key of ['quantity','average','purchaseDate'])form.elements[key].value=h?.[key]??'';
    form.elements.purchaseDate.required=!h;
    remove.hidden=!h;
    form.elements.quantity.focus();
  }
  const picker=bindPicker('holding-search',selectHolding,()=>{selected=null;remove.hidden=true;});
  main.querySelectorAll('[data-edit]').forEach(b=>b.onclick=()=>{
    const h=state.holdings.find(h=>h.symbol===b.dataset.edit);
    picker.reset();
    picker.input.value=h.symbol;
    picker.status.textContent=(h.name??stock(h.symbol)?.name??h.symbol)+' · NSE';
    selectHolding({symbol:h.symbol,name:h.name??stock(h.symbol)?.name});
  });
  form.onsubmit=e=>{
    e.preventDefault();
    if(!selected){notify('Choose a company from the search results.');picker.input.focus();return;}
    const payload={...Object.fromEntries(new FormData(form)),symbol:selected.symbol,name:selected.name};
    act(e.submitter,async()=>{Object.assign(state,await api('holding',payload));render();notify('Holding saved.');});
  };
  remove.onclick=e=>act(e.target,async()=>{if(!selected)return;Object.assign(state,await api('holding',{symbol:selected.symbol,remove:true}));render();notify('Holding removed.');});
  document.querySelector('#import').onsubmit=e=>{
    e.preventDefault();const file=e.target.querySelector('input').files[0];
    if(!file||file.size>125000){notify('Choose a CSV smaller than 125 KB.');return;}
    if(!confirm('Replace all current holdings with this CSV?'))return;
    act(e.submitter,async()=>{Object.assign(state,await api('import',{csv:await file.text()}));render();notify('Portfolio imported.');});
  };
}
function quarterlyHTML(detail){
  const q=detail.quarterly;
  if(!q)return '';
  const divisor=detail.currency==='INR'?10000000:1000000;
  return '<p class="muted">Quarter ended '+escape(q.period)+' · '+(detail.currency==='INR'?'₹ crore':'USD millions')+(detail.basis?' · '+escape(detail.basis):'')+' '+link(detail.source,'Reported facts ↗')+'</p><div class="table-wrap"><table><thead><tr><th>Metric</th><th>Reported</th><th>QoQ</th><th>YoY</th></tr></thead><tbody>'+q.rows.map(row=>'<tr><td>'+escape(row.label)+'</td><td>'+format(row.value===null?null:row.value/divisor)+'</td><td>'+format(row.qoq,'%')+'</td><td>'+format(row.yoy,'%')+'</td></tr>').join('')+'</tbody></table></div>';
}
function guidanceHTML(scorecard){
  if(!scorecard)return '';
  const range=([low,high])=>format(low)+'–'+format(high,'%');
  return '<div class="row"><h3>Guidance and actuals · four reporting checkpoints</h3><p>'+escape(scorecard.summary)+'</p><p class="muted">Primary-source snapshot · '+escape(scorecard.asOf)+'</p>'+
    '<div class="table-wrap"><table><thead><tr><th>Quarter</th><th>Quarterly actuals</th><th>Full-year guidance</th><th>Full-year outcome</th></tr></thead><tbody>'+
    scorecard.rows.map(row=>'<tr><td><strong>'+escape(row.quarter)+'</strong><br><small>'+escape(row.date)+' · '+link(row.release,'Results')+' · '+link(row.transcript,'Call')+'</small></td>'+
      '<td>'+format(row.quarterGrowth,'%')+' CC revenue growth<br>'+format(row.quarterMargin,'%')+' operating margin'+(Number.isFinite(row.quarterAdjustedMargin)?'<br><small>'+format(row.quarterAdjustedMargin,'%')+' adjusted margin</small>':'')+'</td>'+
      '<td>'+escape(row.period)+' · '+range(row.revenue)+' CC growth<br>'+range(row.margin)+' operating margin</td>'+
      '<td>'+(row.final?format(row.final.revenue,'%')+' CC growth · '+escape(row.revenueOutcome)+'<br>'+format(row.final.margin,'%')+' adjusted margin · '+escape(row.marginOutcome)+'<br><small>'+format(row.final.reportedMargin,'%')+' reported margin · '+link(row.final.source,'Year-end results')+'</small>':escape(row.revenueOutcome))+'</td></tr>').join('')+
    '</tbody></table></div><p class="muted">'+escape(scorecard.note)+' '+link(scorecard.context,'Management explanation ↗')+'</p></div>';
}
function reportHTML(r){
  const returns=r.price.returns;
  const inr=r.annual?.currency==='INR';
  const units=inr?'₹ crore':'USD million', divisor=inr?10000000:1000000;
  const insights=(r.insights??[]).map(s=>'<article class="insight"><h3>'+escape(s.title)+'</h3>'+
    (s.note?'<p>'+escape(s.note)+'</p>':'')+
    (s.evidence?'<p class="muted evidence">“'+escape(s.evidence.text)+'” <a href="#source-'+escape(s.evidence.source)+'" data-source-index="'+escape(s.evidence.source)+'">['+escape(s.evidence.source)+']</a></p>':'')+
    (!s.note&&!s.evidence?'<p class="muted">Evidence was unavailable.</p>':'')+'</article>').join('');
  const trends=r.annual?.years.length>1?'<details><summary>Annual history</summary><div class="table-wrap"><table><thead><tr><th>Period end</th><th>Revenue ('+units+')</th><th>Profit ('+units+')</th></tr></thead><tbody>'+r.annual.years.map(y=>'<tr><td>'+escape(y.end)+'</td><td>'+format(y.revenue/divisor)+'</td><td>'+format(y.income/divisor)+'</td></tr>').join('')+'</tbody></table></div></details>':'';
  const quarters=r.results?.periods?.length>1?'<details><summary>Reported quarterly history</summary><div class="table-wrap"><table><thead><tr><th>Period end</th><th>Revenue (₹ crore)</th><th>Profit after tax (₹ crore)</th><th>Source</th></tr></thead><tbody>'+r.results.periods.map(q=>'<tr><td>'+escape(q.end)+'</td><td>'+format(q.revenue/10000000)+'</td><td>'+format(q.income/10000000)+'</td><td>'+link(q.source,'Filing ↗')+'</td></tr>').join('')+'</tbody></table></div></details>':'';
  return '<div class="row-head"><h2>'+escape(r.symbol)+' research</h2>'+tag(r.mode==='demo'?'Sample prices':'Live research')+'</div>'+
    (r.narrative?'<div class="research-summary"><h3>Research brief</h3><p class="preline">'+escape(r.narrative)+'</p></div>':'')+
    (insights?'<h3>Key findings</h3><div class="insights">'+insights+'</div>':'')+
    guidanceHTML(r.guidance)+
    (r.results?'<div class="row"><h3>Latest reported quarter</h3>'+quarterlyHTML(r.results)+'<p class="muted">'+escape(r.results.note)+'</p>'+quarters+'</div>':'')+
    '<p class="muted">Completed session '+escape(r.price.date??'unavailable')+' '+link(r.price.source,'Price history ↗')+'</p>'+
    (r.price.error?'<p class="error">'+escape(r.price.error)+'</p>':'')+
    '<div class="metrics">'+metric('Close',Number.isFinite(r.price.close)?money.format(r.price.close):'—')+metric('Daily adjusted return',format(r.price.day,'%'))+metric('Volume / 20-session mean',format(r.price.volume,'×'))+'</div>'+
    (returns?'<div class="table-wrap"><table><thead><tr><th>Window</th><th>Latest return</th><th>Median rolling</th><th>Observations</th></tr></thead><tbody>'+Object.entries(returns).map(([n,v])=>'<tr><td>'+n+' sessions</td><td>'+format(v.latest,'%')+'</td><td>'+format(v.median,'%')+'</td><td>'+v.observations+'</td></tr>').join('')+'</tbody></table></div>':'')+
    '<div class="row"><h3>Annual fundamentals</h3>'+(r.annual?'<p class="muted">IFRS figures from the annual filing through '+escape(r.annual.years[0].end)+'. '+link(r.annual.source,'Annual filing ↗')+'</p><div class="metrics">'+metric('Annual revenue ('+units+')',format(Number.isFinite(r.annual.years[0].revenue)?r.annual.years[0].revenue/divisor:null))+metric('Annual profit ('+units+')',format(Number.isFinite(r.annual.years[0].income)?r.annual.years[0].income/divisor:null))+metric('Revenue growth',format(r.annual.ratios.revenueGrowth,'%'))+metric('Profit margin',format(r.annual.ratios.netMargin,'%'))+metric('Return on equity',format(r.annual.ratios.returnOnEquity,'%'))+'</div>':'<p class="muted">No comparable annual financial facts available in this run.</p>')+'</div>'+
    trends+'<details class="report-sources"><summary>Sources and coverage</summary><p class="muted">'+escape(r.aiStatus)+'</p>'+
    (r.sources.map((s,i)=>'<p data-report-source="'+(i+1)+'">['+(i+1)+'] '+link(s.url,s.label)+' · <small>'+escape(s.status)+'</small></p>').join('')||'<p class="muted">No annual report or earnings-call transcript returned.</p>')+'</details>';
}
const researchLoading=symbol=>loading('Researching '+symbol+'…','Fetching price history, company filings and earnings calls. Sources are checked before the report is shown.');
function research(id){
  const sectors=[...new Set(state.catalog.map(s=>s.sector))].sort();
  main.innerHTML=hero('03 / Pull','Research desk','Look up an NSE company, compare performance, and save a report you can recheck later.')+
    '<div id="research-progress" aria-live="polite">'+(researchPending?researchLoading(researchPending):'')+'</div>'+
    '<div class="grid">'+panel('Company search',stockPicker('research-search')+'<p class="muted">Choose a company to read the findings here. Source coverage varies by issuer.</p><p class="eyebrow">Quick picks</p><div class="chips">'+state.catalog.filter(s=>s.demo).map(s=>button(s.symbol,'data-research="'+s.symbol+'"')).join('')+'</div>')+
    panel('Sector leaders','<form id="sector"><div class="fields"><label>Sector<select name="name">'+sectors.map(s=>'<option>'+escape(s)+'</option>').join('')+'</select></label><label>Window<select name="days"><option value="21">21 sessions</option><option value="63" selected>63 sessions</option><option value="252">252 sessions</option></select></label></div><button>Rank tracked stocks</button></form><div id="leaders"></div>')+'</div>'+
    '<section class="panel" id="report" '+(report?'':'hidden')+'>'+ (report?reportHTML(report)+ '<div class="actions">'+button('Save report','id="save"','primary')+button(state.watch.includes(report.symbol)?'Remove from watchlist':'Add to watchlist','data-watch="'+escape(report.symbol)+'"')+'</div>':'')+'</section>';
  bindPicker('research-search',(company,control)=>void runResearch(company.symbol,control,true));
  document.querySelector('#sector').onsubmit=e=>{
    e.preventDefault();const params=new URLSearchParams(new FormData(e.target));
    act(e.submitter,async()=>{
      const target=document.querySelector('#leaders');target.innerHTML=loading('Ranking stocks…','Checking which tickers have comparable price history.');
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
async function runResearch(symbol,control,live=false){
  if(!state)return;
  if(section()!=='research'){location.hash='research';}
  const current=state;
  const request=++researchSequence;
  researchPending=symbol;
  const progress=document.querySelector('#research-progress');
  if(progress){progress.innerHTML=researchLoading(symbol);progress.scrollIntoView({block:'nearest'});}
  const pickerStatus=live?document.querySelector('#research-search-status'):null;
  if(pickerStatus)pickerStatus.textContent='Fetching live research for '+symbol+'…';
  await act(control,async()=>{
    try{
      const result=await api('research',{symbol,...(live?{live:true}:{})});
      if(request!==researchSequence||state!==current)return;
      researchPending=null;
      report=result;
      if(section()!=='research')return;
      render();document.querySelector('#report')?.scrollIntoView({block:'start'});
    }catch(error){
      if(request!==researchSequence||state!==current)return;
      researchPending=null;
      const currentProgress=document.querySelector('#research-progress');
      if(currentProgress)currentProgress.innerHTML='<p class="error">'+escape(error.message)+'</p>';
      if(pickerStatus?.isConnected)pickerStatus.textContent=error.message;
    }
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
    panel('Device notifications','<p class="muted">'+escape(state.push.enabled?'Notifications use live data, the NSE trading calendar, and this device’s browser permission.':state.push.reason)+'</p><div class="actions">'+button('Enable on this device','id="subscribe" '+(!state.push.enabled?'disabled':''),'primary')+button('Send test notification','id="test-push" '+(!state.push.enabled?'disabled':''))+button('Disable on this device','id="unsubscribe"')+'</div><p class="muted" id="notification-status" role="status">Briefings are scheduled for 08:55 and 16:00 IST on regular trading days. Special sessions follow the exchange calendar.</p>');
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
    await api('subscription',sub.toJSON());document.querySelector('#notification-status').textContent='Notifications enabled on this device.';
  });
  document.querySelector('#unsubscribe').onclick=e=>act(e.target,async()=>{
    const reg=await navigator.serviceWorker?.getRegistration(), sub=await reg?.pushManager.getSubscription();
    if(sub){await api('subscription',{endpoint:sub.endpoint,remove:true});await sub.unsubscribe();}
    document.querySelector('#notification-status').textContent='Device notifications disabled.';
  });
  document.querySelector('#test-push').onclick=e=>act(e.target,async()=>{
    const status=document.querySelector('#notification-status');
    status.textContent='Sending a test to this device…';
    try{
      const reg=await navigator.serviceWorker?.getRegistration();
      const sub=await reg?.pushManager.getSubscription();
      if(!sub)throw Error('Enable notifications on this device first.');
      await api('subscription/test',{endpoint:sub.endpoint});
      status.textContent='The push service accepted the test. Check whether a FINN notification appeared on this device.';
    }catch(error){status.textContent=error.message;}
  });
}
main.addEventListener('click',e=>{
  const citation=e.target.closest('[data-source-index]');
  if(citation){
    e.preventDefault();
    const sources=citation.closest('section, details')?.querySelector('.report-sources');
    if(sources){sources.open=true;sources.querySelector('[data-report-source="'+citation.dataset.sourceIndex+'"]')?.scrollIntoView({block:'nearest'});}
    return;
  }
  const control=e.target.closest('button');
  if(!control||!state)return;
  const d=control.dataset;
  if(d.research)void runResearch(d.research,control,true);
  if(d.filing)act(control,async()=>{
    const target=control.closest('article').querySelector('.filing-detail');
    target.innerHTML=loading('Reading the disclosure…');
    try{
      const detail=await api('filing-detail?id='+encodeURIComponent(d.filing));
      target.innerHTML='<p class="muted">'+escape(detail.note)+'</p>'+
        (detail.evidence?'<p>“'+escape(detail.evidence)+'”</p>':'')+
        quarterlyHTML(detail);
    }catch(error){target.textContent=error.message;}
  });
  if(d.watch)act(control,async()=>{Object.assign(state,await api('watch',{symbol:d.watch,remove:state.watch.includes(d.watch)}));render();});
  if(d.delete)act(control,async()=>{Object.assign(state,await api('remove-report',{id:d.delete}));render();});
  if(d.recheck)act(control,async()=>{
    const target=document.querySelector('#diff-'+d.recheck);target.innerHTML=loading('Rechecking this report…','Comparing the saved report with the latest available prices and primary sources.');
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

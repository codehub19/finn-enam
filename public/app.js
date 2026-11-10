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
  globe:'M3 12h18M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm0 0c2.8 2.8 4 5.8 4 9s-1.2 6.2-4 9c-2.8-2.8-4-5.8-4-9s1.2-6.2 4-9Z',
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
const companyLogo=symbol=>'<span class="company-logo" aria-hidden="true"><span class="logo-fallback">'+escape(symbol.slice(0,2))+'</span><img src="/logos/'+encodeURIComponent(symbol)+'" alt="" loading="lazy" decoding="async"></span>';
document.addEventListener('load',event=>{
  const image=event.target;
  if(image instanceof HTMLImageElement&&image.parentElement?.classList.contains('company-logo'))image.parentElement.classList.add('has-logo');
},true);
const topicIcon=topic=>'<span class="route-icon news-art">'+icon(topic==='Energy'||topic==='Inflation'?'pulse':topic==='India policy'?'folio':'globe')+'</span>';
const tag=value=>'<span class="tag">'+escape(value)+'</span>';
const metric=(label,value)=>'<div class="metric"><small>'+escape(label)+'</small><strong>'+escape(value)+'</strong></div>';
const panel=(title,body)=>'<section class="panel"><h2>'+title+'</h2>'+body+'</section>';
const hero=(label,title,detail)=>'<section class="page-heading"><h1>'+title+'</h1><p class="muted">'+detail+'</p></section>';
const loading=(label,detail='')=>'<div class="loading" role="status"><span class="spinner" aria-hidden="true"></span><div><strong>'+escape(label)+'</strong>'+(detail?'<p class="muted">'+escape(detail)+'</p>':'')+'</div></div>';
let state, report, researchPending, authMode='login', hours=24, timer, generation=0, installPrompt, researchSequence=0;
const section=()=>['briefing','portfolio','research','saved','settings'].includes(routeParts()[0])?routeParts()[0]:'briefing';
function notify(message){notice.textContent=message;clearTimeout(timer);timer=setTimeout(()=>notice.textContent='',5500);}
async function api(path,payload){
  const res=await fetch('/api/'+path,payload===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
  const result=await res.json();
  if(!res.ok) throw Error(result.error);
  if(payload!==undefined&&['holding','import','watch','preferences'].includes(path)){
    for(const key of Object.keys(dashboard))if(key!=='world')delete dashboard[key];
  }
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
          control.innerHTML=companyLogo(stock.symbol)+'<span class="stock-copy"><strong>'+escape(stock.symbol)+'</strong><small>'+escape(stock.name)+'</small></span><span class="exchange">'+escape(stock.exchange)+'</span>'+icon('arrow');
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
let googleConfig, googleClient, legacyAuth=false;
async function openGoogle(control,migrate=false){
  const message=document.querySelector(migrate?'#google-link-status':'#auth-error');
  if(message)message.textContent='';
  await act(control,async()=>{
    try{
      const client=await googleClient;
      const credential=await client.signInWithPopup(client.auth,new client.GoogleAuthProvider());
      try{
        await api('google',{idToken:await credential.user.getIdToken(),migrate});
        state=await api('state');
        render();
      }finally{await client.signOut(client.auth).catch(()=>{});}
    }catch(error){
      const text=error.code==='auth/popup-blocked'?'Allow pop-ups for FINN and try again.':
        error.code==='auth/popup-closed-by-user'?'Google sign-in was cancelled.':error.code?'Google sign-in is unavailable. Try again or continue as guest.':error.message;
      if(message)message.textContent=text;
    }
  });
}
function bindGoogle(control,migrate=false){
  control.disabled=true;
  googleClient.then(()=>{
    control.disabled=false;
    control.onclick=()=>void openGoogle(control,migrate);
  }).catch(()=>{
    control.textContent='Google sign-in unavailable';
    const status=document.querySelector(migrate?'#google-link-status':'#auth-error');
    if(status)status.textContent='Google sign-in could not load. You can still continue as guest.';
  });
}
function auth(){
  nav.hidden=true; logout.hidden=true;
  const google=Boolean(googleConfig&&!legacyAuth);
  const creating=!googleConfig&&authMode==='register';
  main.innerHTML=`<div class="auth auth-layout">
    <aside class="auth-intro">
      <p class="eyebrow">INDIAN EQUITY WORKSPACE</p>
      <h1>Know what moved.<br>Understand why.</h1>
      <p class="muted">Follow your holdings, read market briefings, and research NSE companies in one place.</p>
      <div class="auth-features">
        <span>${icon('folio')} Portfolio</span><span>${icon('pulse')} Briefings</span><span>${icon('search')} Research</span>
      </div>
    </aside>
    <section class="auth-card" aria-labelledby="auth-title">
      ${google?`<h2 id="auth-title">Welcome to FINN</h2>
      <p class="muted auth-description">Sign in with Google to keep your portfolio and research across devices.</p>
      <p id="auth-error" class="error" role="alert"></p>
      <button type="button" class="primary auth-action" id="google-sign-in" data-pending="Connecting to Google…">Continue with Google</button>`:`
      ${googleConfig?'':`<div class="auth-switch" aria-label="Account options">
        <button type="button" data-auth-mode="login" aria-pressed="${!creating}">Sign in</button>
        <button type="button" data-auth-mode="register" aria-pressed="${creating}">Create account</button>
      </div>`}
      <h2 id="auth-title">${googleConfig?'Sign in to your old FINN account':creating?'Create your FINN account':'Welcome back'}</h2>
      <p class="muted auth-description">${creating?'Start with an 18-stock sample portfolio you can make your own.':'Sign in to open your portfolio and saved research.'}</p>
      <form id="auth">
        <p id="auth-error" class="error" role="alert"></p>
        <div class="fields">
          <label>Email address<input name="email" type="email" autocomplete="username" autocapitalize="none" maxlength="200" required></label>
          <label>Password
            <span class="auth-password"><input id="auth-password" name="password" type="password" autocomplete="${creating?'new-password':'current-password'}" minlength="8" maxlength="128" ${creating?'aria-describedby="password-hint"':''} required>
            <button type="button" id="show-password" aria-controls="auth-password" aria-label="Show password">Show</button></span>
          </label>
          ${creating?'<small id="password-hint">Use at least 8 characters.</small>':''}
        </div>
        <button class="primary auth-action" data-pending="${creating?'Creating your account…':'Signing in…'}">${creating?'Create account':'Sign in'}</button>
      </form>`}
      ${googleConfig?'<button type="button" id="legacy-auth" class="ghost auth-action">'+(google?'Use an existing FINN password':'Back to Google sign-in')+'</button>':''}
      <div class="auth-divider"><span>or explore first</span></div>
      <button type="button" class="auth-action" id="guest" data-pending="Opening guest workspace…">Continue as guest ${icon('arrow')}</button>
      <p class="muted auth-guest-note">No account needed. Guest sessions expire after 24 hours.</p>
    </section>
  </div>`;
  for(const control of main.querySelectorAll('[data-auth-mode]'))control.onclick=()=>{
    if(authMode===control.dataset.authMode)return;
    const email=main.querySelector('[name="email"]').value;
    authMode=control.dataset.authMode;
    auth();
    main.querySelector('[name="email"]').value=email;
    main.querySelector('[data-auth-mode][aria-pressed="true"]').focus();
  };
  main.querySelector('#legacy-auth')?.addEventListener('click',()=>{
    legacyAuth=!legacyAuth;
    authMode='login';
    auth();
  });
  if(google)bindGoogle(main.querySelector('#google-sign-in'));
  const password=main.querySelector('#auth-password'), toggle=main.querySelector('#show-password');
  if(toggle)toggle.onclick=()=>{
    const visible=password.type==='password';
    password.type=visible?'text':'password';
    toggle.textContent=visible?'Hide':'Show';
    toggle.setAttribute('aria-label',visible?'Hide password':'Show password');
  };
  document.querySelector('#guest').onclick=e=>act(e.currentTarget,async()=>{await api('guest',{});state=await api('state');render();});
  const form=main.querySelector('#auth');
  if(form)form.onsubmit=e=>{
    e.preventDefault();const data=Object.fromEntries(new FormData(e.target));
    act(e.submitter,async()=>{
      const error=document.querySelector('#auth-error');
      error.textContent='';
      try{await api(authMode,data);state=await api('state');render();}
      catch(failure){error.textContent=failure.message;}
    });
  };
}
logout.onclick=()=>act(logout,async()=>{
  try{
    const registration=await navigator.serviceWorker?.getRegistration();
    const subscription=await registration?.pushManager.getSubscription();
    if(subscription){await api('subscription',{remove:true,endpoint:subscription.endpoint});await subscription.unsubscribe();}
  }catch(error){notify('Device notification cleanup failed: '+error.message);}
  await api('logout',{});state=null;report=null;researchPending=null;
  for(const key of Object.keys(dashboard))delete dashboard[key];
  render();
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
const dashboard={};
const routeParts=()=>location.hash.slice(1).split('/');
const back=(path,label)=>'<a class="back-link" href="#'+path+'"><span aria-hidden="true">←</span> '+label+'</a>';
const routeCard=(path,iconName,title,detail)=>'<a class="route-card" href="#'+path+'"><span class="route-icon">'+icon(iconName)+'</span><span><strong>'+title+'</strong><small>'+detail+'</small></span>'+icon('arrow')+'</a>';
const lookback=()=>'<div class="controls"><label for="window">Lookback</label><select id="window">'+[24,48,72,168].map(h=>'<option '+(h===hours?'selected':'')+' value="'+h+'">'+h+' hours</option>').join('')+'</select></div>';
const briefSource=(key,force=false)=>{
  const cacheKey=key==='feed'?'feed-'+hours:key;
  if(!force&&dashboard[cacheKey]&&Date.now()-dashboard[cacheKey].time<180000)return dashboard[cacheKey].promise;
  const endpoints={feed:'digest?live=1&hours='+hours,moves:'scan?live=1',world:'world-news'};
  const record={time:Date.now(),promise:api(endpoints[key]+(force?(endpoints[key].includes('?')?'&':'?')+'refresh=1':'')).catch(error=>({error:error.message}))};
  dashboard[cacheKey]=record;
  return record.promise;
};
function filingCard(row,fromPeers=false){
  return '<a class="list-link" href="#briefing/filing/'+encodeURIComponent(row.id)+(fromPeers?'/peers':'')+'"><span>'+tag(row.symbol)+' <small>'+escape(when(row.timestamp))+'</small><strong>'+escape(row.title)+'</strong></span>'+icon('arrow')+'</a>';
}
function moveCard(row){
  return '<article class="row"><h3>'+escape(row.symbol)+'</h3><p>'+format(row.day,'%')+(row.fallback?' reported close move':' · '+format(row.volume,'×'))+' · '+escape(row.date)+'</p><p class="muted">'+escape(row.reasons.join(' · '))+'</p><p>'+escape(row.ratios?row.flags.join(' · ')||'No negative readings in the available annual checks.':'Annual financial checks unavailable.')+' '+link(row.fundamentalSource,'Annual filing ↗')+'</p>'+button('Open research','data-research="'+escape(row.symbol)+'"')+'</article>';
}
function briefing(id){
  const [,view,raw]=routeParts();
  if(view){briefPage(id,view,raw);return;}
  main.innerHTML=hero('','Briefing','Snapshots update before the open and after the close on trading days. Refresh any time.')+
    '<div class="brief-toolbar">'+lookback()+button('Refresh briefing','id="run-brief" data-pending="Running briefing…"','primary')+'</div>'+
    '<div id="brief-status" aria-live="polite"></div><div id="brief-cards" class="route-stack"></div>';
  const windowSelect=document.querySelector('#window'), run=document.querySelector('#run-brief'), status=document.querySelector('#brief-status');
  const cards=document.querySelector('#brief-cards');
  let feed,moves,world,refreshing=false;
  function update(){
    if(id!==generation)return;
    const lead=world?.items?.[0];
    const newsText=lead?escape(lead.title):world?.error?'News sources unavailable':world?'No new tracked releases':'Checking global sources…';
    const stamp=feed?.checkedAt?' · '+(feed.stale?'Last available ':'Updated ')+escape(when(feed.checkedAt)):'';
    const filings=feed?.error?'Exchange filings unavailable · try Refresh briefing':feed?feed.owned.length+' portfolio filings · '+feed.owned.filter(row=>row.alert).length+' selected alerts'+stamp:'Checking exchange filings…';
    const moveText=moves?.error?'Price check unavailable':moves?moves.alerts.length+' flagged · '+moves.coverage+' of '+moves.total+' holdings priced':'Loading saved market snapshot…';
    const related=feed?.error?'Peer filings temporarily unavailable':feed?new Set([...feed.watch,...feed.related].map(row=>row.id)).size+' recent disclosures':'Watchlist and same-sector activity';
    cards.innerHTML=routeCard('briefing/filings','folio','Portfolio filings',filings)+routeCard('briefing/moves','pulse','Unusual moves',moveText)+
      routeCard('briefing/world','globe','World news for India',newsText)+routeCard('briefing/peers','mark','Watchlist and sector peers',related);
  }
  update();
  const load=(key,force,selectedHours=hours)=>briefSource(key,force).then(result=>{
    if(key==='feed'){if(selectedHours!==hours)return;feed=result;}
    else if(key==='moves')moves=result;
    else world=result;
    update();
  });
  windowSelect.onchange=e=>{hours=Number(e.target.value);feed=null;update();void load('feed',false);};
  run.onclick=()=>act(run,async()=>{
    if(refreshing)return;
    refreshing=true;windowSelect.disabled=true;
    status.innerHTML=loading('Updating your briefing…','Checking exchange filings, closing prices and global releases.');
    try{await Promise.all(['feed','moves','world'].map(key=>load(key,true)));}
    finally{status.replaceChildren();windowSelect.disabled=false;refreshing=false;}
  });
  void load('feed',false);void load('world',false);
  void load('moves',false);
}
function briefPage(id,view,raw){
  const title={filings:'Portfolio filings',moves:'Unusual moves',peers:'Watchlist and sector peers',world:'World news for India',filing:'Filing details',story:'Market news detail'}[view];
  if(!title){location.replace('#briefing');return;}
  const world=view==='world'||view==='story';
  const filing=view==='filing', story=view==='story', moves=view==='moves';
  const parent=filing?(routeParts()[3]==='peers'?'briefing/peers':'briefing/filings'):story?'briefing/world':'briefing';
  main.innerHTML=back(parent,filing?(parent.endsWith('peers')?'Peer and watchlist filings':'Portfolio filings'):story?'World news for India':'Briefing')+hero('',title,world?'Official global releases with a short explanation of why each can matter for markets.':'')+
    (!filing&&!story?'<div class="brief-toolbar">'+(!moves&&!world?lookback():'')+button('Refresh','id="brief-refresh" data-pending="Refreshing…"')+'</div>':'')+'<section class="panel" id="brief-detail" aria-live="polite"></section>';
  const target=document.querySelector('#brief-detail');
  let revision=0;
  async function load(force=false){
    const request=++revision;
    target.innerHTML=loading(moves?'Checking prices…':world?'Reading global releases…':'Checking exchange filings…');
    const data=await briefSource(moves?'moves':world?'world':'feed',force);
    if(id!==generation||request!==revision)return;
    if(data.error){target.innerHTML='<p class="error">'+escape(data.error)+'</p>';return;}
    if(moves){
      target.innerHTML='<p class="muted">'+data.coverage+' of '+data.total+' holdings priced'+(data.asOf?' · Latest session '+escape(data.asOf):'')+'.</p>'+
        (data.staleCoverage?'<p class="coverage-note">'+data.staleCoverage+' prices came from the last verified snapshot.</p>':'')+
        (data.archiveCoverage?'<p class="coverage-note">'+data.archiveCoverage+' from NSE daily reports, without a 20-session volume comparison.</p>':'')+
        (data.alerts.map(moveCard).join('')||'<p class="muted">'+(data.coverage?'No thresholds crossed in the available data.':'Price data unavailable.')+'</p>');
      return;
    }
    if(world){
      const newsRows=data.items.map(row=>'<a class="list-link" href="#briefing/story/'+encodeURIComponent(row.id)+'">'+topicIcon(row.topic)+'<span class="news-copy">'+tag(row.topic)+' <small>'+escape(row.source)+'</small><strong>'+escape(row.title)+'</strong></span>'+icon('arrow')+'</a>').join('');
      if(story){
        const item=data.items.find(row=>encodeURIComponent(row.id)===raw);
        target.innerHTML=item?'<div class="row-head">'+tag(item.topic)+'<small>'+escape(when(item.timestamp))+'</small></div><h2>'+escape(item.title)+'</h2><p class="muted">'+escape(item.source)+'</p><h3>Why investors watch this</h3><p>'+escape(item.why)+'</p>'+link(item.url,'Read the official release ↗'):'<p>This story is outside the current news window.</p>';
      }else{
        const coverage='<p class="muted">Past '+data.hours+' hours · '+data.sourcesAvailable+' of '+data.sourcesTotal+' official feeds available</p>';
        target.innerHTML=coverage+(data.hours>24?'<p class="coverage-note">The latest 24 hours were quiet. Showing the most recent tracked releases from the last three days.</p>':'')+
          (newsRows||'<p>No market-related releases in the available feeds for this period.</p>');
      }
      return;
    }
    const coverage=data.coverageNote?'<p class="coverage-note">'+escape(data.coverageNote)+'</p>':'';
    if(filing){
      const findRow=feed=>[...(feed.owned??[]),...(feed.watch??[]),...(feed.related??[])].find(item=>encodeURIComponent(item.id)===raw);
      let row=findRow(data);
      if(!row&&hours!==168){
        row=findRow(await api('digest?live=1&hours=168').catch(()=>({})));
        if(id!==generation||request!==revision)return;
      }
      if(!row){target.innerHTML='<p>This filing is outside the current briefing window.</p>';return;}
      target.innerHTML='<div class="row-head">'+tag(row.symbol)+'<small>'+escape(when(row.timestamp))+'</small></div><h2>'+escape(row.title)+'</h2><p>'+escape(row.detail)+'</p><h3>Why it matters</h3><p>'+escape(row.why)+'</p>'+link(row.url,'Original filing ↗')+'<div id="filing-evidence"></div>';
      if(['Results','Management'].includes(row.category)){
        const evidence=target.querySelector('#filing-evidence');
        evidence.innerHTML=loading('Reading the disclosure…');
        try{const detail=await api('filing-detail?id='+encodeURIComponent(row.id));if(id===generation)evidence.innerHTML='<p class="muted">'+escape(detail.note)+'</p>'+(detail.evidence?'<p>“'+escape(detail.evidence)+'”</p>':'')+quarterlyHTML(detail);}
        catch(error){evidence.textContent=error.message;}
      }
      return;
    }
    if(view==='filings'){
      const material=data.owned.filter(row=>row.category!=='Routine');
      const routine=data.owned.filter(row=>row.category==='Routine');
      target.innerHTML=coverage+'<p class="muted">'+data.owned.length+' filings · Checked '+escape(when(data.checkedAt))+'</p>'+
        (material.map(row=>filingCard(row)).join('')||'<p>No material portfolio filings in this window.</p>')+
        (routine.length?'<details><summary>Routine filings ('+routine.length+')</summary>'+routine.map(row=>filingCard(row)).join('')+'</details>':'');
    }else{
      const peers=data.related.filter(row=>!data.watch.some(item=>item.id===row.id));
      const peerCard=row=>filingCard(row,true);
      target.innerHTML=coverage+((data.watch.length?'<h2>Watchlist</h2>'+data.watch.map(peerCard).join(''):'')+
        (peers.length?'<h2>Sector peers</h2>'+peers.map(peerCard).join(''):'' )||'<p>No recent material disclosures for watchlist companies or tracked peers.</p>');
    }
  }
  const refresh=document.querySelector('#brief-refresh'), windowSelect=document.querySelector('#window');
  if(refresh)refresh.onclick=()=>act(refresh,()=>load(true));
  if(windowSelect)windowSelect.onchange=e=>{hours=Number(e.target.value);void load();};
  void load();
}
const portfolioStock=symbol=>state.catalog.find(stock=>stock.symbol===symbol);
const holdingName=h=>h.name??portfolioStock(h.symbol)?.name??h.symbol;
const stockPath=symbol=>'portfolio/stock/'+encodeURIComponent(symbol);
const cash=value=>Number.isFinite(value)?money.format(value):'—';
const signed=(value,unit='')=>Number.isFinite(value)?(value>0?'+':'')+format(value,unit):'—';
const tone=value=>value>0?'gain':value<0?'loss':'';
function priceChart(series=[]){
  const closes=series.filter(row=>Number.isFinite(row.close));
  if(closes.length<2)return '';
  const values=closes.map(row=>row.close), min=Math.min(...values), max=Math.max(...values);
  const points=values.map((value,i)=>(6+348*i/(values.length-1)).toFixed(1)+','+(112-100*(value-min)/(max-min||1)).toFixed(1)).join(' ');
  return '<figure class="stock-chart"><svg viewBox="0 0 360 120" role="img" aria-label="Completed session closing prices"><path class="chart-grid" d="M6 18h348M6 64h348M6 112h348"/><polyline points="'+points+'"/></svg><figcaption><span>'+escape(closes[0].date)+'</span><span>'+escape(closes.at(-1).date)+'</span></figcaption></figure>';
}
function stockPage(symbol,tab){
  const holding=state.holdings.find(row=>row.symbol===symbol);
  if(!holding){main.innerHTML=back('portfolio','Portfolio')+panel('Holding unavailable','<p>This company is no longer in your portfolio.</p>');return;}
  const base=stockPath(symbol), researchView=['overview','financials','outlook','sources'].includes(tab);
  const info=portfolioStock(symbol);
  const current=state, revision=generation;
  const live=()=>state===current&&generation===revision;
  const header='<div class="stock-title">'+companyLogo(symbol)+'<div><p class="eyebrow">NSE · '+escape(symbol)+'</p><h1>'+escape(holdingName(holding))+'</h1>'+
    (info?'<p class="muted">'+escape(info.sector)+'</p>':'')+'</div></div>';
  main.innerHTML=back('portfolio','Portfolio')+header+
    '<div class="stock-segments" aria-label="Stock screens"><a href="#'+base+'" '+(!researchView?'aria-current="page"':'')+'>Overview</a><a href="#'+base+'/overview" '+(researchView?'aria-current="page"':'')+'>Research</a></div>'+
    '<div id="stock-progress" aria-live="polite"></div><div id="stock-content"></div>';
  const target=document.querySelector('#stock-content'), progress=document.querySelector('#stock-progress');
  const requestResearch=(control,refresh)=>act(control,async()=>{
    progress.innerHTML=researchLoading(symbol);
    try{
      const result=await api('research',{symbol,live:true,reuse:!refresh,refresh});
      if(!live())return;
      if(!result.coverage?.financials&&!result.coverage?.documents){
        progress.innerHTML='<p class="error">Company filings are temporarily unavailable. Try again later.</p>';return;
      }
      if(researchView){progress.replaceChildren();renderStockReport(result);}
      else location.hash=base+'/overview';
    }catch(error){if(live())progress.innerHTML='<p class="error">'+escape(error.message)+'</p>';}
  });
  function researchControls(created){
    return '<p class="muted research-stamp">'+(created?'Last researched '+escape(when(created))+' IST':'No research run yet')+'</p>'+
      '<div class="actions">'+(created&&!researchView?'<a class="button primary" href="#'+base+'/overview">View research</a>':'')+
      button(created?'Refresh research':'Run research','id="run-stock-research"',created&&!researchView?'':'primary')+'</div>';
  }
  function bindResearch(created){
    const control=target.querySelector('#run-stock-research');
    if(control)control.onclick=()=>void requestResearch(control,Boolean(created));
  }
  function renderStockReport(result){
    target.innerHTML=panel('Company research',researchControls(result?.createdAt))+
      (result?'<div class="report-tabs" aria-label="Research sections">'+[['overview','Summary'],['financials','Financials'],['outlook','Outlook'],['sources','Sources']].map(([key,label])=>
        '<a href="#'+base+'/'+key+'" '+(tab===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</div>'+
        '<section class="panel report-view" data-report-base="'+base+'">'+reportHTML(result,tab)+'</section>'+
        '<div class="actions">'+button('Save report','id="save-stock-report"')+'</div>':'');
    bindResearch(result?.createdAt);
    const save=target.querySelector('#save-stock-report');
    if(save)save.onclick=()=>act(save,async()=>{
      const saved=await api('save-report',{id:result.draftId});
      if(!live())return;
      if(!state.saved.some(row=>row.id===saved.id))state.saved.unshift(saved);
      notify('Report saved.');
    });
  }
  if(researchView){
    target.innerHTML=loading('Opening saved research…');
    void api('stock-research?symbol='+encodeURIComponent(symbol)).then(result=>{if(live())renderStockReport(result.report);})
      .catch(error=>{if(live())target.innerHTML='<p class="error">'+escape(error.message)+'</p>';});
    return;
  }
  function renderQuote(price={},created,pending=false){
    const value=Number.isFinite(price.close)?price.close*holding.quantity:null;
    const invested=holding.average*holding.quantity;
    const gain=value===null?null:value-invested;
    const move=Number.isFinite(price.day)?'<span class="stock-move '+tone(price.day)+'">'+signed(price.day,'%')+'</span>':'';
    target.innerHTML='<section class="panel quote-card"><p class="eyebrow">Last traded session</p><div class="quote-line"><strong>'+cash(price.close)+'</strong>'+move+'</div>'+
      '<p class="muted">'+(pending?'Loading market data…':price.date?'Close · '+escape(price.date)+(price.stale?' · Last verified snapshot':''):'A completed-session price is unavailable.')+' '+link(price.source,'Price source ↗')+'</p>'+
      priceChart(price.series)+(price.historySource?'<p class="muted chart-source">'+link(price.historySource,'Historical chart source ↗')+'</p>':'')+'</section>'+
      panel('Your position','<div class="position-grid">'+metric('Quantity',format(holding.quantity))+metric('Average cost',cash(holding.average))+metric('Invested',cash(invested))+metric('Market value',cash(value))+metric('Unrealized P/L',gain===null?'—':(gain>0?'+':'')+cash(gain))+metric('Position return',signed(gain!==null&&invested>0?100*gain/invested:null,'%'))+'</div>')+
      (pending?'':panel('Company research',researchControls(created)));
    if(!pending)bindResearch(created);
  }
  renderQuote({},null,true);
  void api('stock?symbol='+encodeURIComponent(symbol)).then(result=>{if(live())renderQuote(result.price,result.lastResearchedAt);})
    .catch(error=>{if(live()){renderQuote();progress.innerHTML='<p class="error">'+escape(error.message)+'</p>';}});
}
function portfolio(){
  const [,view,raw,tab]=routeParts();
  if(view==='stock'){let symbol='';try{symbol=decodeURIComponent(raw??'');}catch{}stockPage(symbol,tab);return;}
  if(view==='edit'){portfolioEdit();return;}
  if(view==='allocation'){portfolioAllocation();return;}
  main.innerHTML=hero('','Portfolio','Your current holdings.')+
    '<div class="brief-toolbar"><a class="button primary" href="#portfolio/edit">'+icon('tune')+' Edit holdings</a><a class="button" href="#portfolio/allocation">'+icon('folio')+' Sector allocation</a></div>'+
    panel('Holdings <small class="count-label">'+state.holdings.length+'</small>',state.holdings.length?'<div class="holdings-list">'+
      '<div class="holding-row holding-head"><span>Company</span><span>Quantity</span><span>Average cost</span></div>'+
      state.holdings.map(h=>'<div class="holding-row"><a class="holding-company" href="#'+stockPath(h.symbol)+'">'+companyLogo(h.symbol)+'<span class="holding-copy"><strong>'+escape(h.symbol)+'</strong><small>'+escape(holdingName(h))+'</small></span></a><span>'+format(h.quantity)+'</span><span>'+money.format(h.average)+'</span></div>').join('')+'</div>':
      '<p class="muted">Your portfolio is empty.</p>');
}
function portfolioAllocation(){
  const sectors=new Map();
  let zeroCost=0;
  for(const h of state.holdings){
    const cost=h.quantity*h.average;
    if(!Number.isFinite(cost)||cost<=0){zeroCost++;continue;}
    const sector=portfolioStock(h.symbol)?.sector??'Unclassified';
    sectors.set(sector,(sectors.get(sector)??0)+cost);
  }
  const entries=[...sectors].sort((a,b)=>b[1]-a[1]);
  const total=entries.reduce((sum,[,cost])=>sum+cost,0);
  const colors=['#5368db','#16857f','#d78035','#9859b5','#be526b','#4b8ec0','#718b35','#9e6c54','#6d7788','#bd934c'];
  let angle=-Math.PI/2;
  const point=a=>[100+88*Math.cos(a),100+88*Math.sin(a)].map(n=>n.toFixed(4)).join(' ');
  const slices=entries.map(([,cost],i)=>{
    const span=2*Math.PI*cost/total, start=point(angle);
    angle+=span;
    return entries.length===1?'<circle cx="100" cy="100" r="88" fill="'+colors[i]+'"/>':
      '<path d="M 100 100 L '+start+' A 88 88 0 '+(span>Math.PI?1:0)+' 1 '+point(angle)+' Z" fill="'+colors[i%colors.length]+'"/>';
  }).join('');
  const legend=entries.map(([sector,cost],i)=>'<li><svg class="swatch" viewBox="0 0 12 12" aria-hidden="true"><rect width="12" height="12" rx="3" fill="'+colors[i%colors.length]+'"/></svg><span>'+escape(sector)+'</span><strong>'+format(100*cost/total,'%')+'</strong><small>'+money.format(cost)+'</small></li>').join('');
  main.innerHTML=back('portfolio','Holdings')+hero('','Sector allocation','Each slice shows the sector’s share of your portfolio cost.')+
    panel('Distribution by cost',total>0?'<div class="allocation-layout"><svg class="sector-pie" viewBox="0 0 200 200" role="img" aria-label="Pie chart of portfolio cost by sector. Exact percentages follow in the legend.">'+slices+'</svg><ul class="sector-legend">'+legend+'</ul></div><p class="muted">Total cost · '+money.format(total)+(zeroCost?' · '+zeroCost+' holdings without a positive cost are excluded.':'')+'</p>':'<p class="muted">Add a holding with a positive average cost to see sector allocation.</p>');
}
function portfolioEdit(){
  main.innerHTML=back('portfolio','Holdings')+hero('','Edit holdings','Use your total quantity and average purchase cost across all purchases of the same stock.')+
    '<div class="grid">'+panel('Add or update a stock','<form id="holding">'+stockPicker('holding-search')+'<div class="fields"><label>Total quantity<input name="quantity" type="number" min="0.000001" step="any" required></label><label>Average cost (₹)<input name="average" type="number" min="0" step="any" required></label></div><div class="actions"><button class="primary">Save holding</button>'+button('Remove holding','id="remove-holding" hidden')+'</div></form>')+
    panel('Import holdings','<form id="import"><p class="muted">Importing a CSV replaces your existing holdings. Use symbol, quantity and average cost.</p><label>Holdings CSV<input type="file" accept=".csv,text/csv" required></label><div class="actions"><button class="primary">Replace holdings</button><a href="/sample-holdings.csv" download>Sample CSV</a></div></form>')+'</div>'+
    panel('Manage existing holdings',state.holdings.map(h=>'<div class="row row-head"><span><strong>'+escape(h.symbol)+'</strong> <small>'+escape(holdingName(h))+'</small></span>'+button('Edit','data-edit="'+escape(h.symbol)+'" aria-label="Edit '+escape(h.symbol)+'"')+'</div>').join('')||'<p class="muted">No holdings to edit.</p>');
  const form=document.querySelector('#holding'), remove=document.querySelector('#remove-holding');
  let selected;
  function selectHolding(company){
    selected=company;
    const holding=state.holdings.find(h=>h.symbol===company.symbol);
    for(const key of ['quantity','average'])form.elements[key].value=holding?.[key]??'';
    remove.hidden=!holding;
    form.elements.quantity.focus();
  }
  const picker=bindPicker('holding-search',selectHolding,()=>{selected=null;remove.hidden=true;});
  main.querySelectorAll('[data-edit]').forEach(control=>control.onclick=()=>{
    const h=state.holdings.find(item=>item.symbol===control.dataset.edit);
    picker.reset();picker.input.value=h.symbol;picker.status.textContent=holdingName(h)+' · NSE';
    selectHolding({symbol:h.symbol,name:holdingName(h)});
  });
  form.onsubmit=e=>{
    e.preventDefault();
    if(!selected){notify('Choose a company from the search results.');picker.input.focus();return;}
    const payload={...Object.fromEntries(new FormData(form)),symbol:selected.symbol,name:selected.name};
    act(e.submitter,async()=>{Object.assign(state,await api('holding',payload));render();notify('Holding saved.');});
  };
  remove.onclick=()=>act(remove,async()=>{
    if(!selected)return;
    Object.assign(state,await api('holding',{symbol:selected.symbol,remove:true}));render();notify('Holding removed.');
  });
  document.querySelector('#import').onsubmit=e=>{
    e.preventDefault();
    const file=e.target.querySelector('input').files[0];
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
function reportHTML(r,view='all'){
  const returns=r.price.returns;
  const inr=r.annual?.currency==='INR';
  const units=inr?'₹ crore':'USD million', divisor=inr?10000000:1000000;
  const oldTitles={'Trajectory':'Multi-year trajectory','Guidance':'Management outlook','Bull vs. bear':'Bull and bear evidence'};
  const reference=n=>'<a href="#source-'+escape(n)+'" data-source-index="'+escape(n)+'">['+escape(n)+']</a>';
  const excerpt=e=>e?'<p class="muted evidence">“'+escape(e.text)+'” '+reference(e.source)+'</p>':'';
  function insight(title,scope,extra=''){
    const s=(r.insights??[]).find(row=>row.title===title||row.title===oldTitles[title])??{};
    const ai=r.aiSections?.find(row=>row.title===title);
    const cases=title==='Bull vs. bear'?'<div class="case-grid"><p><strong>Bull</strong><br>'+escape(s.bull??'No verified supportive figure in this snapshot.')+'</p><p><strong>Bear</strong><br>'+escape(s.bear??(s.evidence?'See the cited risk disclosure below.':'No verified downside evidence in this snapshot.'))+'</p></div>':'';
    const evidence=excerpt(s.evidence)+excerpt(s.additionalEvidence);
    const analysis=ai?'<p class="section-analysis"><small>Gemini synthesis</small><br>'+escape(ai.text)+' '+ai.citations.map(reference).join(' ')+'</p>':'';
    return '<article class="insight report-topic"><h3>'+title+'</h3><p class="muted topic-scope">'+scope+'</p>'+
      (s.note&&!(title==='Financial snapshot'&&extra)?'<p>'+escape(s.note)+'</p>':'')+cases+analysis+evidence+extra+
      (!s.note&&!evidence&&!ai&&!cases&&!extra?'<p class="muted">No verified disclosure for this section in this run.</p>':'')+'</article>';
  }
  const trends=r.annual?.years.length>1?'<details><summary>Annual history</summary><div class="table-wrap"><table><thead><tr><th>Period end</th><th>Revenue ('+units+')</th><th>Profit ('+units+')</th></tr></thead><tbody>'+r.annual.years.map(y=>'<tr><td>'+escape(y.end)+'</td><td>'+format(y.revenue/divisor)+'</td><td>'+format(y.income/divisor)+'</td></tr>').join('')+'</tbody></table></div></details>':'';
  const quarters=r.results?.periods?.length>1?'<details><summary>Reported quarterly history</summary><div class="table-wrap"><table><thead><tr><th>Period end</th><th>'+(r.results.periods[0].bank?'Total income':'Revenue')+' (₹ crore)</th><th>Profit after tax (₹ crore)</th><th>Source</th></tr></thead><tbody>'+r.results.periods.map(q=>'<tr><td>'+escape(q.end)+'</td><td>'+format(q.revenue/10000000)+'</td><td>'+format(q.income/10000000)+'</td><td>'+link(q.source,'Filing ↗')+'</td></tr>').join('')+'</tbody></table></div></details>':'';
  const latest=r.results?.periods?.[0];
  const crore=value=>Number.isFinite(value)?format(value/10000000):'—';
  const snapshot=latest?'<p class="muted">Quarter ended '+escape(latest.end)+(r.results.stale?' · Verified snapshot':'')+' · ₹ crore</p><div class="metrics">'+
    metric(latest.bank?'Total income':'Revenue',crore(latest.revenue))+metric('Profit after tax',crore(latest.income))+
    metric(latest.bank?'PAT / total income':'PAT margin',format(latest.revenue>0&&Number.isFinite(latest.income)?100*latest.income/latest.revenue:null,'%'))+'</div>'+
    (Number.isFinite(r.annual?.ratios?.returnOnEquity)?'<p class="muted">Annual return on equity · '+format(r.annual.ratios.returnOnEquity,'%')+' · '+escape(r.annual.years[0].end)+'</p>':''):'';
  const overview=
    (r.narrative?'<div class="research-summary"><div class="row-head"><h3>Research brief</h3>'+(r.aiModel?tag('Gemini Flash'):'')+'</div><p class="preline">'+escape(r.narrative)+'</p></div>':'')+
    insight('Business snapshot','What it does, operating segments, and reported revenue mix.')+
    insight('Financial snapshot','Revenue, margins, profit after tax, and key ratios.',snapshot)+
    insight('Bull vs. bear','Evidence that supports or challenges the investment case.');
  const financials=
    insight('Trajectory','Multi-year growth and margin expansion or compression.',trends)+
    insight('Balance sheet','Debt, leverage, funding structure, and working-capital cycle.')+
    insight('Cash quality','Operating cash-flow trend and conversion of profit into cash.')+
    (r.results?'<div class="row"><h3>'+(r.results.stale?'Last verified quarter':'Latest reported quarter')+'</h3>'+quarterlyHTML(r.results)+'<p class="muted">'+escape(r.results.note)+'</p>'+quarters+'</div>':'')+
    '<p class="muted">Completed session '+escape(r.price.date??'unavailable')+' '+link(r.price.source,r.price.fallback?'NSE daily reports ↗':'Price history ↗')+'</p>'+
    (r.price.error?'<p class="error">'+escape(r.price.error)+'</p>':'')+
    (r.price.coverageNote?'<p class="coverage-note">'+escape(r.price.coverageNote)+' '+link(r.price.archive,'NSE report ↗')+'</p>':'')+
    '<div class="metrics">'+metric('Close',Number.isFinite(r.price.close)?money.format(r.price.close):'—')+metric(r.price.fallback?'Reported close move':'Daily adjusted return',format(r.price.day,'%'))+metric(r.price.fallback?'Traded volume':'Volume / 20-session mean',format(r.price.fallback?r.price.tradedVolume:r.price.volume,r.price.fallback?'':'×'))+'</div>'+
    (returns?'<div class="table-wrap"><table><thead><tr><th>Window</th><th>Latest return</th><th>Median rolling</th><th>Observations</th></tr></thead><tbody>'+Object.entries(returns).map(([n,v])=>'<tr><td>'+n+' sessions</td><td>'+format(v.latest,'%')+'</td><td>'+format(v.median,'%')+'</td><td>'+v.observations+'</td></tr>').join('')+'</tbody></table></div>':'')+
    '<div class="row"><h3>Annual fundamentals</h3>'+(r.annual?'<p class="muted">Figures from the annual filing through '+escape(r.annual.years[0].end)+'. '+link(r.annual.source,'Annual filing ↗')+'</p><div class="metrics">'+metric('Annual revenue ('+units+')',format(Number.isFinite(r.annual.years[0].revenue)?r.annual.years[0].revenue/divisor:null))+metric('Annual profit ('+units+')',format(Number.isFinite(r.annual.years[0].income)?r.annual.years[0].income/divisor:null))+metric('Revenue growth',format(r.annual.ratios.revenueGrowth,'%'))+metric('Profit margin',format(r.annual.ratios.netMargin,'%'))+metric('Return on equity',format(r.annual.ratios.returnOnEquity,'%'))+'</div>':'<p class="muted">No comparable annual financial facts available in this run.</p>')+'</div>';
  const outlook=insight('Narrative vs. numbers','Where management commentary agrees or diverges from comparable results.',guidanceHTML(r.guidance))+
    insight('Guidance','Explicit growth, margin, and capex targets with the period they cover.');
  const sources='<div class="report-sources"><h3>Sources and coverage</h3><p class="muted">'+escape(r.aiStatus)+'</p>'+
    (r.sources.map((s,i)=>'<p data-report-source="'+(i+1)+'">['+(i+1)+'] '+link(s.url,s.label)+' · <small>'+escape(s.status)+'</small></p>').join('')||'<p class="muted">No annual report or earnings-call transcript returned.</p>')+'</div>';
  if(view==='overview')return overview;
  if(view==='financials')return financials;
  if(view==='outlook')return outlook;
  if(view==='sources')return sources;
  return overview+financials+outlook+sources;
}
function reportPage(r,base,view,snapshot=false){
  const parent=snapshot?'saved':'research';
  const selected=['overview','financials','outlook','sources'].includes(view)?view:'overview';
  main.innerHTML=back(parent,snapshot?'Saved reports':'Research')+hero('',companyLogo(r.symbol)+escape(r.symbol)+' research',snapshot?'Saved '+escape(when(r.createdAt)):(r.company?.name?escape(r.company.name)+' · Company report':'Company report'))+
    '<div class="report-tabs" aria-label="Report sections">'+[['overview','Overview'],['financials','Financials'],['outlook','Outlook'],['sources','Sources']].map(([key,label])=>'<a href="#'+base+'/'+key+'" '+(selected===key?'aria-current="page"':'')+'>'+label+'</a>').join('')+'</div>'+
    (r.coverage&&!r.coverage.financials&&!r.coverage.documents?'<p class="coverage-note">Financial filings could not be retrieved for this run. Any available listing and market data are shown below. Try Research again later.</p>':'')+
    '<section class="panel report-view" data-report-base="'+base+'">'+reportHTML(r,selected)+'</section>'+
    '<div class="actions report-actions">'+(snapshot?button('Recheck sources','data-recheck="'+escape(r.id)+'"','primary')+button('Delete report','data-delete="'+escape(r.id)+'"'):
      button('Save report','id="save"','primary')+button(state.watch.includes(r.symbol)?'Remove from watchlist':'Add to watchlist','data-watch="'+escape(r.symbol)+'"'))+'</div>'+
    (snapshot?'<div id="diff-'+escape(r.id)+'"></div>':'');
  const save=document.querySelector('#save');
  if(save)save.onclick=()=>act(save,async()=>{
    const saved=await api('save-report',{id:r.draftId??r.id});
    if(!state.saved.some(item=>item.id===saved.id))state.saved.unshift(saved);
    notify('Report saved.');
  });
}
const researchLoading=symbol=>loading('Researching '+symbol+'…','Fetching price history, company filings and earnings calls. Sources are checked before the report is shown.');
function research(id){
  const [,view,tab]=routeParts();
  if(view==='report'&&report){reportPage(report,'research/report',tab);return;}
  if(view==='report')history.replaceState(null,'','#research');
  const sectorsPage=view==='sectors';
  const sectors=[...new Set(state.catalog.map(s=>s.sector))].sort();
  main.innerHTML=(sectorsPage?back('research','Research')+hero('','Sector leaders','Compare adjusted returns over the same trading window.'):
    hero('','Research','Find an NSE company and open a dedicated report.')+
    '<div id="research-progress" aria-live="polite">'+(researchPending?researchLoading(researchPending):'')+'</div>'+
    panel('Company search',stockPicker('research-search')+'<p class="eyebrow">Quick picks</p><div class="chips">'+state.catalog.filter(s=>s.demo).map(s=>button(companyLogo(s.symbol)+s.symbol,'data-research="'+s.symbol+'"','ticker-button')).join('')+'</div>')+
    '<div class="route-stack">'+(report?routeCard('research/report/overview','mark',escape(report.symbol)+' report','Return to your latest research'):'')+routeCard('research/sectors','pulse','Sector leaders','Compare tracked companies')+'</div>');
  if(!sectorsPage){
    bindPicker('research-search',(company,control)=>void runResearch(company.symbol,control,true));
    return;
  }
  main.insertAdjacentHTML('beforeend',panel('Sector and window','<form id="sector"><div class="fields"><label>Sector<select name="name">'+sectors.map(s=>'<option>'+escape(s)+'</option>').join('')+'</select></label><label>Window<select name="days"><option value="21">21 sessions</option><option value="63" selected>63 sessions</option><option value="252">252 sessions</option></select></label></div><button>Rank tracked stocks</button></form><div id="leaders"></div>'));
  document.querySelector('#sector').onsubmit=e=>{
    e.preventDefault();const params=new URLSearchParams(new FormData(e.target));
    act(e.submitter,async()=>{
      const target=document.querySelector('#leaders');target.innerHTML=loading('Ranking stocks…','Checking which tickers have comparable price history.');
      try{
        const data=await api('sector?'+params);
        if(id!==generation)return;
        target.innerHTML='<p class="muted">'+data.rows.length+' of '+data.universe+' tracked stocks · '+data.days+'-session adjusted close return · '+escape(data.asOf||'no completed session')+'</p>'+
          (data.rows.map((s,i)=>'<div class="row row-head"><span>'+(i+1)+'. '+button(companyLogo(s.symbol)+escape(s.symbol),'data-research="'+escape(s.symbol)+'"','ticker-button')+'</span><strong>'+format(s.performance,'%')+'</strong></div>').join('')||'<p class="muted">No comparable quotes returned.</p>');
      }catch(error){target.textContent=error.message;}
    });
  };
}
async function runResearch(symbol,control,live=false){
  if(!state)return;
  if(location.hash!=='#research'){location.hash='research';}
  const current=state;
  const request=++researchSequence;
  researchPending=symbol;
  const progress=document.querySelector('#research-progress');
  if(progress){progress.innerHTML=researchLoading(symbol);progress.scrollIntoView({block:'nearest'});}
  const pickerStatus=live?document.querySelector('#research-search-status'):null;
  if(pickerStatus)pickerStatus.textContent='Fetching live research for '+symbol+'…';
  await act(control,async()=>{
    try{
      const result=await api('research',{symbol,...(live?{live:true,reuse:true}:{})});
      if(request!==researchSequence||state!==current)return;
      researchPending=null;
      report=result;
      if(section()!=='research')return;
      location.hash='research/report/overview';
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
  const [,view,id,tab]=routeParts();
  const snapshot=view==='report'?state.saved.find(r=>r.id===id):null;
  if(snapshot){reportPage(snapshot,'saved/report/'+snapshot.id,tab,true);return;}
  main.innerHTML=hero('04 / Recheck','Saved intelligence','Keep watch on companies and compare a fresh report against a saved snapshot.')+
    '<div class="grid">'+panel('Saved reports',state.saved.map(r=>'<a class="list-link" href="#saved/report/'+escape(r.id)+'/overview"><span><strong>'+escape(r.symbol)+'</strong><small>'+escape(when(r.createdAt))+'</small></span>'+icon('arrow')+'</a>').join('')||'<p class="muted">Run company research and save your first snapshot.</p>')+
    panel('Watchlist',state.watch.map(s=>'<div class="row row-head">'+button(companyLogo(s)+escape(s),'data-research="'+escape(s)+'"','ticker-button')+button('Remove','data-watch="'+escape(s)+'"')+'</div>').join('')||'<p class="muted">Add a company from its research view.</p>')+'</div>';
}
function settings(){
  const s=state.settings;
  const check=(name,label,enabled)=>'<label class="check"><input name="'+escape(name)+'" type="checkbox" '+(enabled?'checked':'')+'>'+escape(label)+'</label>';
  main.innerHTML=hero('05 / Configure','Your settings','Choose the feed, tune what counts as unusual, and manage browser notifications.')+
    panel('Feeds & alert rules','<form id="prefs"><div class="fields"><label>Data mode<select name="mode"><option value="demo">Sample data</option><option value="live" '+(state.mode==='live'?'selected':'')+'>Live providers</option></select></label><label>Daily price move (%)<input name="price" type="number" min=".1" max="100" step=".1" value="'+s.price+'" required></label><label>Volume multiple<input name="volume" type="number" min="1" max="100" step=".1" value="'+s.volume+'" required></label></div><div class="chips">'+state.categories.filter(c=>c!=='Routine').map(c=>check(c,c,s.types.includes(c))).join('')+'</div><details open><summary>Notification schedule · India time</summary>'+check('pre','08:55 before market open',s.pre)+check('post','16:00 after market close',s.post)+'</details><button class="primary">Save preferences</button></form>')+
    panel('Device notifications','<p class="muted">'+escape(state.push.enabled?'Notifications use live data, the NSE trading calendar, and this device’s browser permission.':state.push.reason)+'</p><div class="actions">'+button('Enable on this device','id="subscribe" '+(!state.push.enabled?'disabled':''),'primary')+button('Send test notification','id="test-push" '+(!state.push.enabled?'disabled':''))+button('Disable on this device','id="unsubscribe"')+'</div><p class="muted" id="notification-status" role="status">Briefings are scheduled for 08:55 and 16:00 IST on regular trading days. Special sessions follow the exchange calendar.</p>');
  if(googleConfig&&!state.guest&&!state.googleAccount){
    main.insertAdjacentHTML('beforeend',panel('Move to Google sign-in','<p class="muted">Link the Google account with the same email to copy this workspace to Firestore.</p>'+
      button('Link Google and move my data','id="link-google"')+'<p id="google-link-status" class="error" role="alert"></p>'));
    bindGoogle(main.querySelector('#link-google'),true);
  }
  document.querySelector('#prefs').onsubmit=e=>{
    e.preventDefault();const f=new FormData(e.target);
    act(e.submitter,async()=>{
      const payload={mode:f.get('mode'),settings:{price:Number(f.get('price')),volume:Number(f.get('volume')),types:state.categories.filter(c=>f.has(c)),pre:f.has('pre'),post:f.has('post')}};
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
    if(sources){sources.querySelector('[data-report-source="'+citation.dataset.sourceIndex+'"]')?.scrollIntoView({block:'nearest'});}
    else{
      const base=citation.closest('[data-report-base]')?.dataset.reportBase;
      if(base)location.hash=base+'/sources';
    }
    return;
  }
  const control=e.target.closest('button');
  if(!control||!state)return;
  const d=control.dataset;
  if(d.research)void runResearch(d.research,control,true);
  if(d.watch)act(control,async()=>{Object.assign(state,await api('watch',{symbol:d.watch,remove:state.watch.includes(d.watch)}));render();});
  if(d.delete)act(control,async()=>{Object.assign(state,await api('remove-report',{id:d.delete}));location.hash='saved';});
  if(d.recheck)act(control,async()=>{
    const target=document.querySelector('#diff-'+d.recheck);target.innerHTML=loading('Rechecking this report…','Comparing the saved report with the latest available prices and primary sources.');
    try{
      const {diff,next}=await api('recheck',{id:d.recheck});
      target.innerHTML='<p class="muted">Checked '+escape(when(next.createdAt))+'</p>'+(diff.map(x=>'<p><strong>'+escape(x.label)+'</strong> · '+escape(typeof x.before==='number'?format(x.before):x.before)+' → '+escape(typeof x.after==='number'?format(x.after):x.after)+'</p>').join('')||'<p>No change detected in comparable fields.</p>')+'<details><summary>View fresh report</summary>'+reportHTML(next)+'</details>';
    }catch(error){target.textContent=error.message;}
  });
});
window.addEventListener('hashchange',()=>{render();window.scrollTo(0,0);});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;install.hidden=false;});
window.addEventListener('appinstalled',()=>{install.hidden=true;installPrompt=null;});
install.onclick=async()=>{await installPrompt?.prompt();install.hidden=true;installPrompt=null;};
if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
const googleConfigRequest=api('auth-config').then(result=>result.google).catch(()=>null);
try{state=await api('state');}catch(error){if(error.message!=='Sign in to continue.')notify(error.message);}
googleConfig=await googleConfigRequest;
if(googleConfig){
  const sdk='https://www.gstatic.com/firebasejs/12.12.0/';
  googleClient=Promise.all([import(sdk+'firebase-app.js'),import(sdk+'firebase-auth.js')]).then(async ([app,auth])=>{
    const instance=auth.getAuth(app.initializeApp(googleConfig));
    await auth.setPersistence(instance,auth.inMemoryPersistence);
    return {...auth,auth:instance};
  });
  googleClient.catch(()=>{});
}
render();

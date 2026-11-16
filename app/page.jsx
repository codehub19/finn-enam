import Script from 'next/script';

const tabs = ['Briefing', 'Portfolio', 'Research', 'Saved', 'Settings'];

export default function Home() {
  return <>
    <header><div className="shell top">
      <a className="brand" href="#briefing"><img src="/icon.svg" width="36" height="36" alt="" />FINN<span>INVESTOR INTELLIGENCE</span></a>
      <div className="actions">
        <button id="theme" className="ghost" aria-label="Toggle light or dark theme"><span>Theme</span></button>
        <button id="install" hidden>Install</button>
        <button id="logout" className="ghost" hidden>Sign out</button>
      </div>
    </div></header>
    <div className="shell layout">
      <nav id="nav" aria-label="App sections" hidden>{tabs.map(tab => <a key={tab} href={'#' + tab.toLowerCase()}>{tab}</a>)}</nav>
      <main id="main" aria-busy="true"><p className="muted">Opening FINN…</p></main>
    </div>
    <div id="notice" role="status" aria-live="polite" />
    <noscript>Enable JavaScript to use FINN.</noscript>
    <Script src="/app.js" type="module" strategy="afterInteractive" />
  </>;
}

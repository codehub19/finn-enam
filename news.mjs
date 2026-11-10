import {createHash} from 'node:crypto';

const feeds=[
  {source:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/press_monetary.xml',topic:'Interest rates'},
  {source:'Federal Reserve',url:'https://www.federalreserve.gov/feeds/speeches.xml',topic:'Interest rates',filter:/inflation|economic outlook|monetary policy|interest rate|labor market/i},
  {source:'European Central Bank',url:'https://www.ecb.europa.eu/rss/press.html',topic:'Interest rates',filter:/monetary policy|inflation|interest rates|economic outlook|bank lending|growth|financial stability|trade|interview/i},
  {source:'Bank of Japan',url:'https://www.boj.or.jp/en/rss/whatsnew.xml',topic:'Interest rates',filter:/monetary policy|outlook|economic activity|prices|financial markets|foreign exchange|policy board/i},
  {source:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/cpi.rss',topic:'Inflation'},
  {source:'U.S. Bureau of Labor Statistics',url:'https://www.bls.gov/feed/empsit.rss',topic:'Employment'},
  {source:'U.S. Energy Information Administration',url:'https://www.eia.gov/rss/todayinenergy.xml',topic:'Energy',filter:/oil|gas|lng|fuel|petrol|diesel|energy prices|power demand|crude/i}
];

const context={
  'Interest rates':'Policy and inflation expectations can affect bond yields, currencies, and how investors value equities. For Indian stocks, watch whether the dollar and foreign fund flows move alongside the announcement.',
  Inflation:'A change in inflation can shift expectations for interest rates and the U.S. dollar. That can affect global risk appetite and the rupee.',
  Employment:'A surprise in U.S. hiring or wages can change expectations for growth and interest rates. That can influence equity valuations and demand expectations for exporters.',
  Energy:'Changes in fuel supply or demand can affect crude and natural-gas prices. India’s import bill and costs for fuel-intensive companies can be sensitive to those moves.'
};
const field=(item,name)=>new RegExp('<'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)</'+name+'>','i').exec(item)?.[1]??'';
function clean(value){
  const entities={amp:'&',quot:'"',apos:"'",lt:'<',gt:'>'};
  return value.trim().replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1').replace(/<[^>]+>/g,' ')
    .replace(/&(amp|quot|apos|lt|gt);/g,(_,name)=>entities[name]).replace(/\s+/g,' ').trim();
}
export function parseWorldFeed(xml,feed){
  if(!/<(?:rss|rdf:RDF)\b/i.test(xml))throw Error('Unexpected news feed format');
  const base=new URL(feed.url);
  return [...xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)].flatMap(([,entry])=>{
    const title=clean(field(entry,'title'));
    const timestamp=Date.parse(clean(field(entry,'pubDate')||field(entry,'dc:date')));
    const rawLink=clean(field(entry,'link'));
    const url=rawLink?URL.parse(rawLink,base):null;
    if(!title||!Number.isFinite(timestamp)||!url||url.hostname!==base.hostname||!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port)return [];
    if(feed.filter&&!feed.filter.test(title+' '+url.pathname))return [];
    url.protocol='https:';
    const href=url.href;
    return [{id:createHash('sha256').update(href).digest('hex').slice(0,20),source:feed.source,topic:feed.topic,title:title.slice(0,250),timestamp,url:href,why:context[feed.topic]}];
  });
}

export function selectWorldNews(items,now=Date.now()){
  const rows=[...new Map(items.filter(row=>row.timestamp<=now&&row.timestamp>=now-72*3600000).map(row=>[row.url,row])).values()]
    .sort((a,b)=>b.timestamp-a.timestamp);
  const latest=rows.filter(row=>row.timestamp>=now-24*3600000);
  return {hours:latest.length||!rows.length?24:72,items:(latest.length?latest:rows).slice(0,18)};
}

let cachedFeed;
export async function worldNews(){
  if(!cachedFeed||cachedFeed.until<=Date.now()){
    const promise=Promise.allSettled(feeds.map(async feed=>{
      const res=await fetch(feed.url,{signal:AbortSignal.timeout(6500),headers:{Accept:'application/rss+xml, application/xml, text/xml, */*'}});
      if(!res.ok)throw Error('Unavailable feed');
      return parseWorldFeed(await res.text(),feed);
    })).then(results=>{
      const available=results.filter(r=>r.status==='fulfilled');
      return {sourcesAvailable:available.length,sourcesTotal:feeds.length,rows:available.flatMap(r=>r.value)};
    });
    cachedFeed={until:Date.now()+600000,promise};
  }
  const {rows,sourcesAvailable,sourcesTotal}=await cachedFeed.promise;
  if(!sourcesAvailable)cachedFeed.until=Date.now()+60000;
  return {sourcesAvailable,sourcesTotal,...selectWorldNews(rows),...(sourcesAvailable?{}:{error:'Official global market news feeds are temporarily unavailable.'})};
}

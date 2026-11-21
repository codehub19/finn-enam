import {classify} from './data.mjs';
import {quarterlyComparison} from './insights.mjs';

const plain=html=>html.replace(/<[^>]+>/g,' ').replace(/&amp;/g,'&').replace(/&nbsp;/g,' ').replace(/\s+/g,' ').trim();
function exchangePdf(raw){
  const url=URL.parse(raw.replace(/&amp;/g,'&'));
  if(url?.origin!=='https://www.bseindia.com')return null;
  const file=url.searchParams.get('Pname');
  if(/^\/stockinfo\/AnnPdfOpen\.aspx$/i.test(url.pathname)&&/^[\da-f-]{36}\.pdf$/i.test(file??''))
    return 'https://www.bseindia.com/xml-data/corpfiling/AttachLive/'+file;
  return /^\/xml-data\/corpfiling\/(?:AttachLive|AttachHis)\/[\da-f-]{36}\.pdf$/i.test(url.pathname)?url.href:null;
}
function periodDate(attrs,label){
  const iso=/data-date-key="(\d{4}-\d{2}-\d{2})"/.exec(attrs)?.[1];
  if(iso)return iso;
  const month=plain(label);
  if(!/^[A-Z][a-z]{2} \d{4}$/.test(month))return null;
  const start=new Date('01 '+month+' 00:00:00 GMT');
  return Number.isFinite(+start)?new Date(Date.UTC(start.getUTCFullYear(),start.getUTCMonth()+1,0)).toISOString().slice(0,10):null;
}
export function companyIndex(html,symbol,source){
  const sources=[],rows=[];
  for(const [,attrs,body] of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)){
    const raw=/\bhref="([^"]+)"/i.exec(attrs)?.[1];
    const url=raw&&exchangePdf(raw);
    if(!url)continue;
    const label=plain(body);
    const type=/^Annual Report \d{4}$/i.test(label)?'Annual report':label==='Transcript'?'Earnings call':label==='PPT'?'Results release':null;
    if(type&&!sources.some(item=>item.type===type))sources.push({url,type,label:symbol+' · '+label});
    const timestamp=Date.parse(/<time\b[^>]*datetime="([^"]+)"/i.exec(body)?.[1]);
    if(Number.isFinite(timestamp)){
      const title=plain(body.split(/<div\b/i)[0]);
      rows.push({id:'bse-'+symbol+'-'+url.split('/').pop(),symbol,title,timestamp,url:raw,detail:title,category:classify(title)});
    }
  }
  const section=html.match(/<section\b[^>]*\bid="quarters"[^>]*>([\s\S]*?)<\/section>/i)?.[1]??'';
  const table=section.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1]??'';
  const header=table.match(/<thead[\s\S]*?<\/thead>/i)?.[0]??'';
  const periods=[...header.matchAll(/<th\b([^>]*)>([\s\S]*?)<\/th>/gi)].slice(1)
    .map(([,attrs,label])=>({end:periodDate(attrs,label),source:source+'#quarters'}));
  if(/Figures in Rs\. Crores/i.test(section)){
    for(const [,row] of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
      const cells=[...row.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(([,cell])=>plain(cell));
      const field=({'Sales':'revenue','Revenue':'revenue','Net Profit':'income','Profit before tax':'pbt'})[cells.shift()?.replace(/\s*\+$/,'').trim()];
      if(!field||cells.length!==periods.length)continue;
      cells.forEach((cell,i)=>{const n=cell.replaceAll(',','');if(/^-?\d+(?:\.\d+)?$/.test(n))periods[i][field]=Number(n)*1e7;});
    }
  }
  const reported=periods.filter(row=>row.end&&Number.isFinite(row.revenue)).reverse();
  const results=reported.length?{periods:reported,quarterly:quarterlyComparison(reported),currency:'INR',source:source+'#quarters',basis:source.includes('/consolidated/')?'Consolidated':'Standalone',secondary:true,note:'Quarterly figures compiled by Screener.in in rupees crore. Changes computed by FINN.'}:null;
  return {sources,rows,results};
}

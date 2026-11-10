import {inflateRawSync} from 'node:zlib';

export function parseDailyReport(zip,date){
  if(zip.length<30||zip.length>1000000||zip.readUInt32LE(0)!==0x04034b50||zip.readUInt16LE(8)!==8)throw Error('Invalid NSE report archive');
  const offset=30+zip.readUInt16LE(26)+zip.readUInt16LE(28);
  const compressedSize=zip.readUInt32LE(18);
  if(!compressedSize||offset+compressedSize>zip.length)throw Error('Incomplete NSE report archive');
  const csv=inflateRawSync(zip.subarray(offset,offset+compressedSize),{maxOutputLength:6000000}).toString();
  const [header,...lines]=csv.split(/\r?\n/);
  const columns=header.split(',');
  const indexes=['TradDt','FinInstrmTp','TckrSymb','SctySrs','ClsPric','PrvsClsgPric','TtlTradgVol'].map(c=>columns.indexOf(c));
  if(indexes.includes(-1))throw Error('Unexpected NSE daily report columns');
  const quotes=new Map();
  for(const line of lines){
    const cells=[...line.matchAll(/(?:^|,)(?:"([^"]*)"|([^,]*))/g)].map(m=>m[1]??m[2]);
    const [day,type,symbol,series,closeValue,previousValue,volumeValue]=indexes.map(i=>cells[i]);
    if(day!==date||type!=='STK'||!['EQ','BE','BZ','SM','ST'].includes(series)||!symbol||!(Number(closeValue)>0))continue;
    if(quotes.has(symbol)&&series!=='EQ')continue;
    const close=Number(closeValue),previous=Number(previousValue);
    quotes.set(symbol,{date,close,day:previous>0?100*(close/previous-1):null,tradedVolume:volumeValue?Number(volumeValue):null});
  }
  if(!quotes.size)throw Error('No eligible equities in NSE daily report');
  return quotes;
}
const textOf=(item,field)=>{
  const value=new RegExp('<'+field+'>([\\s\\S]*?)</'+field+'>','i').exec(item)?.[1]??'';
  const entities={'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>'};
  return value.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/,'$1').replace(/&(amp|quot|apos|lt|gt);/g,token=>entities[token]).trim();
};
const nameKey=name=>name.toUpperCase().replace(/[^A-Z0-9]+/g,'');
export function parseAnnouncementRss(xml,directory,parseDate,classify,exchangePage,feed={}){
  if(!/<rss\b/i.test(xml))throw Error('Unexpected NSE announcements feed');
  const names=new Map(directory.map(row=>[nameKey(row.name),row.symbol]));
  const rows=new Map();
  for(const [,item] of xml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)){
    const name=textOf(item,'title').split(/\s+-\s+Ex-Date:/i)[0];
    const attachment=textOf(item,'link');
    const description=textOf(item,'description');
    const indexedSymbol=/\/AR_\d+_([A-Z0-9&-]+)_\d{4}_/i.exec(attachment)?.[1]?.toUpperCase();
    const symbol=names.get(nameKey(name))??indexedSymbol;
    const annualDate=/AS ON DATE\s*:\s*(\d{2}-[A-Z]{3})-(\d{2})/i.exec(description);
    const timestamp=parseDate(textOf(item,'pubDate')||(annualDate?annualDate[1]+'-20'+annualDate[2]+' 00:00:00':''));
    if(!symbol||!Number.isFinite(timestamp))continue;
    const [detail,subject]=description.split(/\s*\|SUBJECT:\s*/i);
    const title=subject||feed.title||'Corporate disclosure';
    const url=/^https:\/\/(?:nsearchives\.nseindia\.com\/(?:corporate|annual_reports)\/|www\.nseindia\.com\/companies-listing\/)/i.test(attachment)?attachment:exchangePage;
    const id=['rss',symbol,timestamp,title,url].join('|');
    rows.set(id,{id,symbol,title,detail:detail.slice(0,900),timestamp,url,category:feed.category??classify(title+' '+detail)});
  }
  return [...rows.values()];
}

import test from 'node:test';
import assert from 'node:assert/strict';
import {companyIndex} from '../company-index.mjs';

test('company outside the seed list gets dated filings and comparable quarterly data',()=>{
  const file='12345678-abcd-1234-abcd-123456789012.pdf';
  const href='https://www.bseindia.com/stockinfo/AnnPdfOpen.aspx?Pname='+file;
  const html='<a href="'+href+'">Transcript</a><a href="'+href+'">Results<div><time datetime="2026-11-20T17:30:00+05:30">20 Nov</time></div></a>'+
    '<section id="quarters">Figures in Rs. Crores<table><thead><tr><th></th><th>Jun 2026</th><th>Sep 2026</th></tr></thead>'+
    '<tr><td>Sales +</td><td>100</td><td>125</td></tr><tr><td>Net Profit</td><td>10</td><td></td></tr></table></section>';
  const index=companyIndex(html,'TEST','https://www.screener.in/company/TEST/consolidated/');
  assert.equal(index.sources[0].type,'Earnings call');
  assert.equal(index.rows[0].timestamp,Date.parse('2026-11-20T12:00:00Z'));
  assert.equal(index.results.quarterly.period,'2026-09-30');
  assert.equal(index.results.quarterly.rows[0].qoq,25);
  assert.equal(index.results.periods[0].revenue,125e7);
  assert.equal(index.results.periods[0].income,undefined);
  assert.equal(companyIndex(html.replaceAll('www.bseindia.com','example.com'),'TEST','').sources.length,0);
});

test('research survives unavailable filing indexes with dated secondary financials',async t=>{
  const {research}=await import('../providers.mjs');
  t.mock.method(globalThis,'fetch',async url=>{
    if(String(url).includes('scanner.tradingview.com'))
      return Response.json({data:[{s:'NSE:DEEPAKNTR',d:['Deepak Nitrite','Process Industries','Specialty Chemicals',100e7,12e7,1759190400,'INR',8e7,380e7,1743379200,40e7,28e7]}]});
    throw Error('Upstream unavailable');
  });
  const r=await research('DEEPAKNTR','live',true);
  assert.equal(r.results.provider,'TradingView');
  assert.equal(r.results.periods[0].income,12e7);
  assert.ok(r.sources.some(s=>s.status==='Secondary financial data'&&s.url.includes('NSE-DEEPAKNTR')));
});

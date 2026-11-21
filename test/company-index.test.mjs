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

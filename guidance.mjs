const investor='https://www.infosys.com/investors/reports-filings/quarterly-results/';
const release=period=>investor+period+'/documents/ifrs-usd-press-release.pdf';
const call=period=>investor+period+'/documents/transcripts/earningscall.pdf';

// Issuer-disclosed facts from the four releases available on 2026-11-09.
// The period of the guidance is separate from the quarter that published it.
const checkpoints=[
  {quarter:'Q3 FY26',date:'2026-01-14',period:'FY26',revenue:[3,3.5],margin:[20,22],quarterGrowth:1.7,quarterMargin:18.4,quarterAdjustedMargin:21.2,path:'2025-2026/q3'},
  {quarter:'Q4 FY26',date:'2026-04-23',period:'FY27',revenue:[1.5,3.5],margin:[20,22],quarterGrowth:4.1,quarterMargin:20.9,path:'2025-2026/q4'},
  {quarter:'Q1 FY27',date:'2026-07-23',period:'FY27',revenue:[1.5,3],margin:[20,22],quarterGrowth:2.4,quarterMargin:21.1,path:'2026-2027/q1'},
  {quarter:'Q2 FY27',date:'2026-10-23',period:'FY27',revenue:[1,2],margin:[20,22],quarterGrowth:1.5,quarterMargin:21,path:'2026-2027/q2'}
];
const classify=(value,[low,high])=>value<low?'Below range':value>high?'Above range':'Within range';

export function guidanceScorecard(symbol){
  if(symbol!=='INFY')return null;
  const finalFY26={revenue:3.1,margin:21,reportedMargin:20.3,source:release('2025-2026/q4')};
  const rows=checkpoints.map(({path,...point})=>{
    const final=point.period==='FY26'?finalFY26:null;
    return {...point,release:release(path),transcript:call(path),final,
      revenueOutcome:final?classify(final.revenue,point.revenue):'Pending full-year results',
      marginOutcome:final?classify(final.margin,point.margin):'Pending full-year results'};
  });
  return {asOf:'2026-11-09',rows,
    summary:'Infosys met its January FY26 revenue and adjusted operating-margin ranges. In FY27, management lowered the top of its growth range from 3.5% to 3.0% and then to 2.0%, while keeping its margin range at 20–22%. The October call attributed the cut to weaker first-half performance and the revised outlook.',
    note:'The quarterly figures show what was delivered each quarter. Guidance is full-year, so only a matching full-year result is scored. FY26 margin uses the company’s adjusted basis for the January guidance. FY27 is open at this snapshot.',
    context:call('2026-2027/q2')};
}

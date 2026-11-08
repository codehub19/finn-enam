import {filings,research} from '../providers.mjs';
const [inbox,report]=await Promise.all([filings(24,'live'),research('INFY','live',true)]);
console.log(JSON.stringify({
  filingRows:inbox.rows.length,filingError:inbox.error,
  quoteDate:report.price.date,quoteError:report.price.error,
  annual:report.annual,
  sources:report.sources,
  aiStatus:report.aiStatus
},null,2));


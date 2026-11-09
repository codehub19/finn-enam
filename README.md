# FINN · Investor intelligence

FINN is a mobile-first web app for the ENAM AI Engineer Build Challenge. It pairs a portfolio filing inbox with a research desk that can save and recheck the evidence behind a company report.

## Run in two minutes

Requires Node.js 22.13 or later. The sample workspace runs without packages or credentials.

```sh
npm start
```

Open [FINN locally](http://127.0.0.1:4173), create an account with a test email and a password of at least eight characters, and use **Briefing → Scan holdings**. PERSISTENT and TATAPOWER demonstrate the two threshold types in sample mode. Next, open **Research**, run INFY, save the report, and recheck it under **Saved**. **Settings** switches from illustrative data to live providers. Use the browser menu to install the app when supported.

Run `npm test` for the calculation, CSV, calendar and report comparison tests plus a loopback integration test. The test starts a temporary local server and checks that separate accounts cannot read each other's saved reports or inherit portfolio changes. It also verifies the PWA assets. The test environment must permit loopback connections.

## What works

| Area | Behavior |
| --- | --- |
| Portfolio | 18 sample NSE-listed holdings across eight sectors and illustrative size bands. Search the NSE directory by company name, ticker, or ISIN, then record quantity, average cost and purchase date. Add, edit, remove or replace holdings via CSV. The optional purchase_date column uses YYYY-MM-DD. Each holding stores one purchase date per ticker. |
| Accounts | Passwords hashed with scrypt and random salts, opaque expiring sessions in HttpOnly cookies, and account-scoped SQLite storage for holdings, reports, preferences, watchlist, and push subscriptions. Use a single instance and a persistent disk. |
| Push inbox | Select 24, 48, 72, or 168 hours. Lists every matching portfolio filing returned by the NSE equities response, deduplicates by exchange ID, prioritizes selected material categories, and collapses routine filings. Related context comes from other tracked stocks in the same sectors. |
| Anomalies | Default absolute daily adjusted return ≥ 5% or volume ≥ 2× its previous 20 completed sessions' mean. Both thresholds are editable. When covered annual data is available, live scans flag negative growth, margin, or ROE. |
| Research | Enter any NSE symbol. Live mode attempts to fetch annual reports and call transcripts, extracts readable text, and optionally generates a cited plain-English brief. Calculations stay in code. Save the exact research snapshot displayed and recheck against refreshed prices and primary document hashes. |
| Sector rankings | Sort the tracked sector universe by 21-, 63-, or 252-session adjusted close return. Only rows with the same latest completed session and enough history qualify. Shows ranked and total coverage. |
| Install and alerts | Manifest and service worker with offline shell assets. Authenticated data requires a connection. Web Push requires a supported browser, HTTPS, VAPID keys, a current NSE calendar, live mode, and a running server. |

## Sources and calculations

- **Listed company search.** The authenticated `GET /api/stocks?q=...` route reads NSE’s equity directory, caches it for 24 hours, and returns up to 10 ranked matches. It labels stale and sample results if NSE is unavailable. Choosing a match in Research runs live research for that company without changing the workspace mode. The quick picks still follow the workspace mode. [NSE securities available for trading](https://www.nseindia.com/static/market-data/securities-available-for-trading)

- **Prices and volumes.** Yahoo Finance chart history for `.NS` symbols. Latest return = adjusted close ÷ adjusted close N sessions earlier − 1. Rolling median uses all eligible N-session observations in the returned two-year window. Quote coverage and source dates are visible. The intraday row is excluded until 15:45 IST for normal sessions.
- **Filings.** The NSE website equities announcements endpoint provides filing titles, disclosure descriptions, time and attachment URLs. FINN retains returned filings in the selected window, including routine items. Exchange feed access, date-range limits and response completeness can vary. The app exposes fetch failures. It cannot certify completeness across exchanges. [NSE corporate announcements](https://www.nseindia.com/companies-listing/corporate-filings-announcements)
- **Primary documents.** The app tries NSE discovery first, with known issuer or exchange-regulator documents for selected companies as fallback. PDF extraction uses Poppler's `pdftotext`. Image-only scans need OCR, which this prototype does not provide. Selected passages go to the configured model with numbered citations and instructions to use only supplied evidence. Document labels and fetch status remain visible if AI is unavailable.
- **Financial figures.** Supported SEC filers use annual IFRS XBRL facts in INR or USD, with a consistent currency within each snapshot. Annual growth compares like periods. Margin = profit attributable to owners ÷ revenue. ROE uses average opening and closing attributable equity. Blank or incompatible inputs remain unavailable. Coverage is narrower than price research. [SEC data APIs](https://www.sec.gov/search-filings/edgar-application-programming-interfaces)
- **Freshness.** The server shares a bounded in-memory cache for external data. Quotes cache for 30 minutes, filings for 3 minutes, discovery for 1 hour, and documents and AI output for 24 hours. Recheck bypasses the source-data cache and reuses an AI result only when the model request is identical.

## Scope boundaries

The seed cost basis, market-cap labels, prices, and announcements are illustrative in sample mode. Live mode never substitutes illustrative prices or disclosures for missing live data. Sector ranking covers the built-in catalog and does not claim market-wide leadership. Peer context uses sector membership. General news, BSE-only ingestion, company-specific competitor mapping, automatic quarterly filing tables, full-universe structured annual fundamentals and broker account syncing are outside this prototype. Research is for investigation and shows no trade recommendation.

Broker import is feasible. Upstox documents an OAuth authorization-code flow and a long-term holdings endpoint with ISIN, symbol, quantity, and average price. Zerodha Kite Connect uses a request-token exchange and access tokens that expire by the next morning. A follow-on would start with a one-time, read-only import and account-bound OAuth state, verify holdings by ISIN and exchange, preview the replacement, and avoid retaining tokens beyond the import. CSV works immediately without broker credentials. [Upstox authentication](https://upstox.com/developer/api-documentation/authentication/) · [Upstox holdings](https://upstox.com/developer/api-documentation/get-holdings/) · [Kite login](https://www.kite.trade/docs/connect/v3/user/)

See [Deployment](DEPLOYMENT.md), [Build history](BUILD_HISTORY.md), and [Covering note](COVERING_NOTE.md).

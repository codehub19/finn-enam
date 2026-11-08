# FINN build history

## 8 November 2026

1. Continued from the initial product-design chat and reviewed both ENAM challenge PDFs. Chose the filing inbox and evidence-based company research as the central workflows.
2. Created a mobile-first account workspace with a curated NSE portfolio. Implemented private SQLite state and separate sample/live modes so reviewers can evaluate the experience without provider keys.
3. Built deterministic filing prioritization, anomaly detection, rolling returns, coverage-aware sector rankings, XBRL-derived ratios, and source-aware report comparison. Kept the language model limited to interpreting fetched primary excerpts.
4. Connected the service worker, subscription management and IST scheduler. Push setup is explicit and the server requires a verified current-year calendar.
5. Exercised the prototype with automated tests for calculations, calendar exclusions, CSV import, report saving and recheck, sector ranking, the PWA shell, and cross-account access. Verified live Yahoo Finance and NSE responses separately.

## AI conversation records

- Product design chat: [Explain Challenge Requirements](chatgpt-conversation://6af0427f-73e8-83e8-acf7-78c4da456e93)
- Implementation: the current Codex conversation, which contains the implementation decisions, tool calls and test results. Export or share the conversation from Codex and add the evaluator-accessible link to the covering email. This repository contains a milestone history. The chat share/export is a separate submission item.


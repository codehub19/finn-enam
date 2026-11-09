# FINN build history

## 8 November 2026

1. Continued from the initial product-design chat and reviewed both ENAM challenge PDFs. Chose the filing inbox and evidence-based company research as the central workflows.
2. Created a mobile-first account workspace with a curated NSE portfolio. Implemented private SQLite state and separate sample/live modes so reviewers can evaluate the experience without provider keys.
3. Built deterministic filing prioritization, anomaly detection, rolling returns, coverage-aware sector rankings, XBRL-derived ratios, and source-aware report comparison. Kept the language model limited to interpreting fetched primary excerpts.
4. Connected the service worker, subscription management and IST scheduler. Push setup is explicit and the server requires a verified current-year calendar.
5. Passed five automated tests covering calculations, calendar exclusions, CSV import, report saving and recheck, sector ranking, the PWA shell, and cross-account access. The in-app browser walkthrough confirmed signup, theme switching, anomaly scanning, INFY research, report saving, watchlisting and recheck.
6. Verified live Yahoo Finance quotes and NSE announcements. A live INFY run read the FY2025–26 Infosys annual report and the October 2026 earnings-call filing, and computed ratios from the latest comparable annual SEC facts returned in the test. That structured feed returned FY2024–25 figures. Live model output and browser push delivery need configured credentials and were outside the verification run.

## AI conversation records

- Product design chat: [Explain Challenge Requirements](chatgpt-conversation://6af0427f-73e8-83e8-acf7-78c4da456e93)
- Implementation: [shared Codex build conversation](https://chatgpt.com/s/cx_6af1bf87bbf48191ae63ef68e93d9931).

## 9 November 2026

- Redesigned the interface around neutral dark and light palettes with periwinkle actions, custom vector marks, frosted navigation, and a shared company picker. Kept data surfaces more opaque to preserve contrast. [Apple materials guidance](https://developer.apple.com/design/human-interface-guidelines/materials) · [TradingView symbol search](https://www.tradingview.com/support/solutions/43000746682-symbol-search-find-any-symbol-on-tradingview/)
- Connected the picker to the official NSE equity directory. Portfolio now supports purchase dates and a sector allocation view based on cost. Research can use live providers for a selected company while the workspace stays in sample mode.
- Made Briefing live by default and added an on-demand refresh of filings and completed-session checks. Added inline progress, a calmer layout, in-app research findings, leadership background excerpts, and NSE quarterly comparisons. Live verification matched five Infosys quarterly filings, including both comparable periods, and the seven automated tests passed.
- Added an Infosys guidance scorecard covering four reporting checkpoints. Matched full-year guidance and actuals by fiscal period and measurement basis. Added a deployment health check, a real push test action, and a GitHub and Render submission runbook.

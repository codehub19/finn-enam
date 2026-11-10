# Deploy FINN

For the exact GitHub and Render steps, follow [Deploy and submit](SUBMISSION.md).

Deploy one persistent Node.js process behind HTTPS. Use a host that allows outbound HTTPS to NSE, Yahoo Finance, SEC and your configured model provider. The process runs the alert poller. A host that sleeps will miss briefing windows.

The Work Sites project was reserved during the build. The supplied backend uses Node's SQLite API, local PDF extraction and a persistent scheduler, so the repository targets a Node or Docker host. The Work Sites Worker runtime would require a separate port to managed storage and scheduled jobs.

## Build and host

The supplied Dockerfile installs Node, the optional Web Push library and Poppler for PDF text extraction. Build from the repository root.

```sh
docker build -t finn .
docker volume create finn-data
docker run --name finn --restart unless-stopped --env-file .env -p 127.0.0.1:4173:4173 -v finn-data:/data finn
```

Copy `.env.example` to `.env` first. For the container set `HOST=0.0.0.0` and `FINN_DB=/data/finn.sqlite`. Set `PUBLIC_ORIGIN=https://your-domain.example` to the exact external origin. Configure your HTTPS reverse proxy to forward requests to port 4173 and preserve the original host. For example, a Caddy site for that domain needs `reverse_proxy 127.0.0.1:4173`. Keep the database on persistent storage and back it up using a SQLite-aware method.

For a direct Node deployment, run `npm ci`, install `poppler-utils` with the host package manager, then start with `npm start`. The offline sample mode can run without npm dependencies.

## Live data and AI

- Use **Run live briefing** and check the reported quote coverage. Allow outbound HTTPS and observe NSE and Yahoo availability. The public web endpoints have no availability or completeness guarantee.
- Set `SEC_USER_AGENT` to an application name and a real contact email for supported XBRL fundamentals.
- Set `GEMINI_API_KEY` and optionally `GEMINI_MODEL` for qualitative research. The app sends document excerpts and a ticker, with no holdings or login credentials.
- Check that `pdftotext -v` works on the host, or set `PDFTOTEXT` to the executable path. An alternative is to install `pypdf` into a Python environment and set `PDF_PYTHON` to that interpreter.

## Enable Web Push

1. Run `npx web-push generate-vapid-keys` after installing dependencies. Store the keys as `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` in the server environment. Set `VAPID_SUBJECT` to a real contact URI such as `mailto:owner@example.com`.
2. Set `NSE_CALENDAR` to an absolute path for the current year. A 2026 equity calendar is supplied at `config/nse-2026.json` (container path `/app/config/nse-2026.json`). Review it against current exchange circulars and update it when the exchange announces changes. The scheduler skips holidays and weekends, with explicit dated overrides for special sessions such as the 2026 Muhurat session. It fails closed when the calendar year is missing or stale. [NSE holidays](https://www.nseindia.com/resources/exchange-communication-holidays?apiversion=v2)
3. Open FINN over HTTPS on a supported device, choose the briefing and triggered-alert options, and use **Enable on this device**. Scheduled briefings use live data regardless of workspace mode. On supported iOS versions, first add FINN to the Home Screen. Keep the backend running.
4. Regular-session windows open at 08:55 and 16:00 Asia/Kolkata. The minute-based scheduler polls cached filings for selected material categories and deduplicates deliveries by endpoint and event. EOD anomalies are included in the after-close briefing, or sent separately when triggered alerts are enabled and the after-close briefing is disabled. Missing coverage is shown in the after-close notification. Browser and OS delivery timing may vary.

For submission, verify signup, filing coverage, INFY research, app install, and delivery to a consenting test device from the actual HTTPS origin before sharing its URL. The prototype has no email verification or account recovery. Limit access to evaluators when piloting.

## Google sign-in and Firestore on Render

The existing Render service still hosts FINN. Google accounts use Firebase Auth and store holdings, watchlists, settings, saved and latest reports, and push subscriptions in Firestore. Guest workspaces and shared market snapshots use the local SQLite database. Firebase Spark can cover this setup within its Auth and Firestore quotas. The Render sleep schedule still affects notifications.

1. Open the dedicated Firebase project, `finn-enam-app`, using its owner account. Enable Authentication, enable the Google provider, and add `finn-enam-u5a1.onrender.com` under **Authentication → Settings → Authorized domains**.
2. Create the default Firestore Standard database in production mode. Keep its client security rules closed. Render uses the Firebase Admin SDK and IAM to access it.
3. Grant a dedicated Render service account `roles/datastore.user` and a project custom role containing only `firebaseauth.users.createSession`. Store the service-account JSON in Render as the secret `FIREBASE_SERVICE_ACCOUNT`. Use a single JSON value. Keep the key out of Git and chat.
4. Copy the Firebase Web app configuration into the Render variable `FIREBASE_WEB_CONFIG` as JSON. It must contain `apiKey`, `appId`, `authDomain`, and `projectId`. Use the project's default `firebaseapp.com` auth domain and set `PUBLIC_ORIGIN` to the HTTPS Render origin.
5. Deploy, then use a Google account to sign in. Add a watchlist entry or save a report. Sign out and back in and verify that it is present. Run a test notification after opting in.

For an accessible legacy workspace, sign in with its FINN password and use **Settings → Link Google and move my data** before opening a new workspace with that Google account. The verified email must match and the destination must be new. This copies the portfolio, watchlist, settings, saved and recent research, and notification subscriptions. Password hashes stay in SQLite. Data lost in a prior free Render reset cannot be transferred. If a surviving legacy database has been backed up, mount it using `FINN_DB` during the migration window.

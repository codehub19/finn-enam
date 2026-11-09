# Deploy and submit FINN

## 1. Publish the code to GitHub

Download `FINN.git.bundle` and open PowerShell in the download folder. Create an empty GitHub repository named `finn-enam`. Leave the README, licence and .gitignore options unchecked. Use a public source repository or give the reviewers access to the private repository.

```powershell
git clone --branch main .\FINN.git.bundle finn-enam
cd finn-enam
git remote set-url origin https://github.com/YOUR_GITHUB_USERNAME/finn-enam.git
git push -u origin main
```

Replace `YOUR_GITHUB_USERNAME` before running the command. Complete GitHub sign-in if prompted. Use the repository's Code tab URL in the email. The Git bundle preserves the build commits and excludes the local database and environment file. [GitHub’s publishing instructions](https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github)

## 2. Deploy on Render with HTTPS and persistent storage

1. Sign in to the [Render dashboard](https://dashboard.render.com/). Select **New → Web Service** and connect the GitHub repository. Select branch **main**, runtime **Docker**, root directory blank, Dockerfile **./Dockerfile**, and leave the Docker command override blank.
2. Choose a paid web-service instance and attach a persistent disk in **Advanced**. Set its mount path to **/data**. The persistent disk keeps user accounts, holdings, reports, and subscriptions across restarts. The scheduler needs an always-running service. Render only supports persistent disks on paid services.
3. Set the health check path to **/healthz**. Add the environment values below, then deploy. The service’s **Events** view should show a successful deploy, and opening the generated URL with `/healthz` appended should return `{"status":"ok"}`.
4. Copy the actual HTTPS origin from the service dashboard. Add **PUBLIC_ORIGIN** with that exact origin, without a trailing slash, and save and redeploy. Open the resulting URL on your phone and create a new test account. This is the reviewer-facing prototype URL.

| Environment variable | Value |
| --- | --- |
| HOST | 0.0.0.0 |
| PORT | 10000 |
| FINN_DB | /data/finn.sqlite |
| NSE_CALENDAR | /app/config/nse-2026.json |
| PUBLIC_ORIGIN | The exact HTTPS origin shown by Render. Set after the URL is assigned. |
| SEC_USER_AGENT | FINN research followed by your contact email, for optional SEC structured facts |
| GEMINI_API_KEY | Your project API key, only if you want the optional AI synthesis |
| GEMINI_MODEL | gemini-3.8-flash (default). Override if your project uses another supported Gemini Flash model. |

Keep keys in the host's environment settings. FINN reads live market data and produces source highlights without a Gemini API key. The container includes Poppler for PDF extraction. Refresh the bundled NSE calendar when the exchange publishes updates or a new trading year begins. [Render web-service setup](https://render.com/docs/web-services) · [Render persistent disks](https://render.com/docs/disks)

## 3. Verify notifications and the demo

From the cloned repository, run these commands to generate a VAPID key pair. Store the output in Render. Keep the private key out of the repository and email.

```powershell
npm ci
npx web-push generate-vapid-keys
```

Set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` in Render. Use a real contact URI such as `mailto:your-email@example.com` for the subject. Redeploy. Open FINN over HTTPS in a supported browser. On iPhone, add the app to the Home Screen and open it from there. In **Settings**, save both briefing times, select **Enable on this device**, grant permission, then select **Send test notification**. Confirm a notification appears on the actual device. Push-service acceptance alone does not establish delivery.

On a regular NSE trading day, confirm both scheduled notifications on the test device at **08:55 and 16:00 IST**. The bundled calendar suppresses holidays and defines special-session overrides. Keep the host running while testing. If you demonstrate the optional AI synthesis, run live Infosys research with the configured model and check that the synthesis appears with evidence references.

Suggested phone demo

1. Sign up, open **Briefing**, set **72 hours** if the 24-hour window is quiet, and select **Run live briefing**.
2. Open **Research → INFY** and find **Guidance and actuals**. The scorecard distinguishes four quarterly checkpoints from full-year guidance outcomes. Save the report.
3. Under **Saved**, recheck the report. Then research **BAJFINANCE** to show that the engine works outside the curated demo tickers.
4. Open the prototype and repository URLs in a signed-out browser or on another device. Verify the reviewer can access both.

## 4. Submit to ENAM

Address the email to **assessment@enam.com** with the subject **IIT Delhi – AI Engineer - 2027**. The brief lists **15 November 2026** as the deadline.

Use [the covering note](COVERING_NOTE.md). Replace both URL placeholders with verified URLs. Include [the Codex build conversation](https://chatgpt.com/s/cx_6af1bf87bbf48191ae63ef68e93d9931) and attach `FINN-design-conversation.md`. The export marks one truncated response. If you have the original ChatGPT conversation open, a full share link can replace the export. The source ZIP and Git bundle are optional backups alongside the required GitHub repository URL.

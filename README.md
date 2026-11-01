# Daily Reading — Cloudflare Pages + D1

This version is prepared for Cloudflare Pages Functions and Cloudflare D1. It does not require Flask, Python, or a SQLite file on a server. The original reading content, page structure, styling, navigation, and favicon assets are retained.

## 1) Create the D1 database

In the Cloudflare dashboard:
1. Open **Workers & Pages → D1 SQL Database** (menu wording may vary).
2. Create a database named `daily-reading-db`.
3. Open its database details and copy its **Database ID**.
4. Replace `REPLACE_WITH_YOUR_D1_DATABASE_ID` in `wrangler.toml` with that ID.

## 2) Create the table

Open the D1 database's **Console** and run the complete contents of `schema.sql`.

## 3) Deploy to Cloudflare Pages

1. Put the contents of this folder in a GitHub repository, keeping the `functions` folder at the repository root.
2. In Cloudflare, open **Workers & Pages → Create → Pages → Connect to Git** and select the repository.
3. For a plain static HTML project, use the repository root as the build output directory (`.`). No build command is required.
4. Deploy the project.
5. In the Pages project settings, open **Settings → Bindings** and add a **D1 database** binding:
   - Variable name: `DB`
   - D1 database: `daily-reading-db`
6. Redeploy the project so the binding is available to the Functions runtime.

The D1 binding is configured in the Cloudflare Pages dashboard as described above. If you later deploy with Wrangler CLI, add the D1 binding to your Wrangler configuration using the real database ID from your Cloudflare dashboard.

## 4) Verify

Open `https://YOUR-SITE.pages.dev/api/health`. Expected response:

```json
{"status":"ok","database":"connected"}
```

Then open the site, click a DAY button, refresh, and confirm the count remains. The API also exposes `GET /api/history?client_id=...` for the timestamped event history used by the current browser profile.

## Database design

`reading_events(id, client_id, day_number, read_at)` stores one row per reading. Counts are calculated from these events. Undo deletes the latest event for that day and reset deletes events belonging to the current browser-profile ID.

## Existing progress

The current site imports legacy localStorage counts into D1 once when that browser profile first connects and the D1 record set is empty. Keep the same browser and domain during the first visit after deployment so the old local progress can be imported. Browser-profile IDs are stored locally and are not account logins; this version does not sync progress across different devices or browsers.

## Notes

- Do not upload a Flask app or `requirements.txt`; Cloudflare Pages Functions run on Cloudflare's Workers runtime, not as a persistent Python server.
- Keep the D1 database ID private to your deployment configuration; never put secrets in front-end JavaScript.
- Use a custom domain only after the Pages deployment is working.

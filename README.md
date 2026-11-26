# Habits

A personal habit tracker that runs in the browser and installs to the phone's Home Screen: a quiet weekly
view of your habits, a journal, and to-do lists.

- **Habits** – each habit across the week. Tap a day to mark it done; tap the name for Add note, Stats and
  Edit. Stats shows the streaks and a month calendar.
- **To-do** – several named lists; tick items off into a Done section.
- **Journal** – the general journal, or the notes on one habit, chosen from the title menu.
- **Settings** – theme, preferences, export, restore and Google Sheets backup.

Data is stored on the device. Nothing is sent anywhere unless you export it or set up the Google Sheets
backup, which writes to a sheet you own.

## Using it

The app is served from GitHub Pages: `https://adam-z-n.github.io/Habit-Tracker/`. On iPhone, open it in
Safari, tap Share, then **Add to Home Screen**; it then opens full screen and works offline.

Because a browser may clear a site's storage it has not seen for a while, set up a backup:
[Google Sheets backup](docs/GOOGLE_SHEETS.md), or export a JSON file from Settings now and then.

## Developing

```
npm install
npm run dev        # local server
npm test           # unit tests (rules, export, restore, Sheets script)
npm run typecheck
npm run build      # production build in dist/
```

- `src/core` – the rules, with no browser code: data model (`types.ts`), completion, streaks and rates
  (`stats.ts`), activity breakdowns (`breakdown.ts`), changes to the data including to-do lists (`ops.ts`),
  export (`exporter.ts`), restore, migration and merge (`importer.ts`), the Sheets client (`sheets.ts`).
- `src/ui` – the screens (Preact).
- `apps-script/Code.gs` – the script that runs inside the user's Google Sheet.
- `docs/DATA_FORMAT.md` – the backup and CSV formats. `docs/ROADMAP.md` – what is planned.

Merges to `main` deploy to GitHub Pages (`.github/workflows/deploy.yml`). In the repository settings,
Pages must have **Source: GitHub Actions**.

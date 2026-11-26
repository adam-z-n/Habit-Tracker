# Notes for Claude

A personal habit tracker (requirements came from the owner as a PRD, "Onrise-inspired"). Web-first in
TypeScript (Vite + Preact), served from GitHub Pages, installable as a PWA; a native iOS wrapper may come
later. README, `docs/DATA_FORMAT.md`, `docs/GOOGLE_SHEETS.md`, `docs/ROADMAP.md` hold the details.

## Layout

- `src/core` – rules with no DOM: `types.ts` (data model), `stats.ts` (completion, streaks, rates),
  `breakdown.ts` (per-activity metrics), `ops.ts` (all mutations), `exporter.ts`, `importer.ts` (validate,
  migrate, merge), `sheets.ts`, `periods.ts`, `units.ts`, `zip.ts`.
- `src/ui` – Preact screens: `today.tsx` (Habits), `habitEditor.tsx`, `habitStats.tsx`, `journal.tsx`, `todo.tsx`,
  `settings.tsx`; `common.tsx` has the palette, `TitleMenu` and line icons; `sheet.tsx` has bottom sheets and
  full-screen pages (`{ page: true }`). `store.ts` holds the one `AppData` in localStorage (`habits:data`) and
  `mutate()` saves and redraws. Sheets settings live in `habits:sync` and are never exported.
- `apps-script/Code.gs` – runs in the user's Google Sheet; tested through a fake in `tests/backup.test.ts`.

## Rules to keep

- Completions are derived from records, never stored (prevents double counting).
- Activity types and measurement fields are archived, not removed; records keep their own unit.
- Goal edits append to `habit.goals` so past days keep their goal.
- Changing the stored shape: bump `SCHEMA_VERSION`, add a step to `migrate`, update `docs/DATA_FORMAT.md`,
  add a test. Old backups must stay restorable.
- Every mutation sets `updatedAt`; deletions add a tombstone (merge depends on both).
- The Habits screen is the weekly card view (`WeekCard` in `src/ui/today.tsx`, modelled on a screenshot the
  owner sent). Tapping a day mark toggles a plain habit and opens the activity picker for older habits that
  still have activity types. The expanded card shows only Add note, Stats and Edit (owner's request, 0.3).
- Since 0.3 the editor no longer offers icons, daily amounts, activity types, measurements, reminders,
  category, description or start date, and there is no Progress tab. The data model still has them so older
  data keeps working; saving a habit must leave them untouched.
- Habit colors are soft (`SOFT_COLORS`); text on them is dark. The app accent (`ACCENTS`) stays deep.
- Journal and To-do follow the owner's "calm and minimalist" brief: a title menu top left, a thin + top
  right, plain lists, no extra chrome.
- Journal entries have `kind` `journal` or `note` (a note has exactly one habit in `habitIds`). Deleting a
  habit turns its notes into journal entries.
- The seven acceptance scenarios from the PRD are tests in `tests/scenarios.test.ts`.

## Working here

- `npm run typecheck`, `npm test`, `npm run build`. Vite 8 (oxc), TypeScript 7, Preact 11, Vitest 5.
- Screenshots: `npm run build`, `npx vite preview --port 4173` in the background, then a Playwright script
  (`NODE_PATH=/opt/node-tools/node_modules`, iPhone 13). Seed data by writing `habits:data` to localStorage.
- Never push to `main`; one PR per round of changes. Keep `CHANGELOG.md` and `docs/ROADMAP.md` current.
- The Google Sheets backup has only been tested against the fake, not a live deployment (as of 0.3.0).

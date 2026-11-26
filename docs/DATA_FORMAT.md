# Data format

Everything the app stores is one JSON object (`AppData`, defined in `src/core/types.ts`). A backup file wraps
it in an envelope:

```json
{
  "format": "habit-tracker-backup",
  "formatVersion": 1,
  "exportedAt": "2026-11-15T14:03:22.120Z",
  "appVersion": "0.5.0",
  "timeZone": "America/New_York",
  "data": { "schemaVersion": 5, "habits": [], "activityTypes": [], "records": [], "journal": [], "reminders": [], "todoLists": [], "todos": [], "settings": {}, "deleted": [] }
}
```

`formatVersion` and `schemaVersion` only go up. The app restores any backup with a version up to its own
(`migrate` in `src/core/importer.ts` upgrades older data step by step) and refuses a newer one with a message
to update.

Schema versions: 1 was the first; 2 added `kind` to journal entries (older entries become `journal`); 3 added
`todoLists` and `todos`, the optional `amount` and `unit` of `minimum`, and moved habits whose color was on the
pre-0.3 palette to the matching softer color (`OLD_COLORS` to `SOFT_COLORS` in `src/core/importer.ts`; other
colors are left alone); 4 gave each to-do list a `color`, assigned in list order from the habit palette; 5 added `todoListIds` to habits
(empty for older habits) and the optional `todoId` to records.

## Conventions

- Ids are 16 hexadecimal characters, created once and never reused. Rows refer to each other by id.
- Days are local calendar days, `YYYY-MM-DD`. Times of day are local `HH:MM`. `createdAt` and `updatedAt` are
  UTC ISO timestamps. Each record also stores the IANA time zone it was made in (`tz`).
- History does not depend on the current setup. Removing an activity type or a measurement only hides it
  (`archived: true`); records keep their ids, values and the unit each value was entered in.

## Entities

| Entity | Key fields |
| --- | --- |
| `habits[]` | `id`, `name`, `description`, `icon`, `color`, `category`, `startDate`, `status` (`active`, `paused`, `archived`), `order`, `goals[]`, `minimum`, `fields[]`, `todoListIds[]` (to-do lists whose items complete the habit) |
| `habits[].goals[]` | `from` (day), `frequency`, `target`. A habit's goal history; the last entry is the current goal. Each day is judged by the goal in effect on that day. |
| `frequency` | `{type:"daily"}`, `{type:"weekdays",days:[0-6]}` (0 is Sunday), `{type:"perWeek",times}`, `{type:"perMonth",times}`, `{type:"interval",every}` (every N days from the start date) |
| `target` | `{fieldId, amount}`: an amount to reach each day, summed over one number field. Or `null`. |
| `minimum` | `{label, countsAsComplete, amount?, unit?}`: the smallest-unit version of the habit, e.g. `amount` 1 and `unit` "page", with `label` "1 page". Older data may have only `label`. Or `null`. |
| `habits[].fields[]` | Measurements: `id`, `name`, `kind` (`number`, `choice`, `text`), `unit`, `precision`, `options[]`, `required`, `archived` |
| `activityTypes[]` | `id`, `habitId`, `name`, `icon`, `color`, `fieldIds` (which fields it uses; `null` is all), `defaults` (values for one-tap logging), `order`, `archived` |
| `records[]` | One activity event: `id`, `habitId`, `activityTypeId` (or `null`), `date`, `time`, `tz`, `level` (`full` or `min`), `values[]` (`{fieldId, value, unit}`), `note`, `todoId` (set when ticking off that to-do made the record; unticking it deletes the record) |
| `journal[]` | `id`, `kind` (`journal`, or `note` for a note about one habit, whose id is then the only entry in `habitIds`), `date`, `text`, `mood` (1–5 or `null`), `habitIds[]` |
| `reminders[]` | `id`, `habitId`, `time`, `days[]`, `text`, `enabled`. Kept for older data; since 0.3.0 the app no longer shows or edits reminders. |
| `todoLists[]` | `id`, `name`, `color` (one of the habit colors), `order` |
| `todos[]` | `id`, `listId`, `text`, `done`, `doneAt` (timestamp or `null`), `order`. Deleting a list deletes its items. |
| `settings` | `theme`, `accent`, `weekStart`, `distanceUnit`, `timeFormat`, `detail` |
| `deleted[]` | `{id, at}`: remembers deletions so merging an older backup does not bring items back |

## Completions are derived

Completions are not stored. They are calculated from the records, which is what prevents double counting:

- **Daily goals** (every day, chosen weekdays, every N days): a scheduled day is complete when it has any
  record. Two activities on one day are two records and one completed day. With an (older) daily amount, a
  day above the amount is `exceeded`.
- **Weekly and monthly goals**: each record is a session toward "N times". With a daily amount, a day with
  activity counts once.
- There is no partly done day (since 0.3): `min` records, and days short of an old daily amount, count as
  complete. `countsAsComplete` is kept in the data but no longer changes anything.
- A day that was not scheduled is never a miss.

## CSV export and Google Sheet tabs

Seven tables, joined by id:

| File | One row per | Links |
| --- | --- | --- |
| `habits.csv` | habit | |
| `activity_types.csv` | activity type | `habit_id` |
| `activity_records.csv` | activity record | `habit_id`, `activity_type_id` |
| `habit_completions.csv` | day (daily goals) or week/month (weekly and monthly goals) that has activity | `habit_id`, `record_ids` |
| `journal_entries.csv` | journal entry | `habit_ids` |
| `todo_lists.csv` | to-do list | |
| `todo_items.csv` | to-do | `list_id` |

Structured values are also given as JSON columns (`goals_json`, `fields_json`, `values_json`). The CSV files
are for reading and analysis; restoring uses the JSON backup.

## Merging

Restore offers Replace or Merge. Merge matches items by id and keeps the copy with the later `updatedAt`; a
deletion wins over a copy that was not edited after it. Merging the same backup twice changes nothing.

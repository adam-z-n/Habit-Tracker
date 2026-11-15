# Data format

Everything the app stores is one JSON object (`AppData`, defined in `src/core/types.ts`). A backup file wraps
it in an envelope:

```json
{
  "format": "habit-tracker-backup",
  "formatVersion": 1,
  "exportedAt": "2026-11-15T14:03:22.120Z",
  "appVersion": "0.2.0",
  "timeZone": "America/New_York",
  "data": { "schemaVersion": 2, "habits": [], "activityTypes": [], "records": [], "journal": [], "reminders": [], "settings": {}, "deleted": [] }
}
```

`formatVersion` and `schemaVersion` only go up. The app restores any backup with a version up to its own
(`migrate` in `src/core/importer.ts` upgrades older data step by step) and refuses a newer one with a message
to update.

Schema versions: 1 was the first; 2 added `kind` to journal entries (older entries become `journal`).

## Conventions

- Ids are 16 hexadecimal characters, created once and never reused. Rows refer to each other by id.
- Days are local calendar days, `YYYY-MM-DD`. Times of day are local `HH:MM`. `createdAt` and `updatedAt` are
  UTC ISO timestamps. Each record also stores the IANA time zone it was made in (`tz`).
- History does not depend on the current setup. Removing an activity type or a measurement only hides it
  (`archived: true`); records keep their ids, values and the unit each value was entered in.

## Entities

| Entity | Key fields |
| --- | --- |
| `habits[]` | `id`, `name`, `description`, `icon`, `color`, `category`, `startDate`, `status` (`active`, `paused`, `archived`), `order`, `goals[]`, `minimum`, `fields[]` |
| `habits[].goals[]` | `from` (day), `frequency`, `target`. A habit's goal history; the last entry is the current goal. Each day is judged by the goal in effect on that day. |
| `frequency` | `{type:"daily"}`, `{type:"weekdays",days:[0-6]}` (0 is Sunday), `{type:"perWeek",times}`, `{type:"perMonth",times}`, `{type:"interval",every}` (every N days from the start date) |
| `target` | `{fieldId, amount}`: an amount to reach each day, summed over one number field. Or `null`. |
| `minimum` | `{label, countsAsComplete}`: the smallest-unit version of the habit. Or `null`. |
| `habits[].fields[]` | Measurements: `id`, `name`, `kind` (`number`, `choice`, `text`), `unit`, `precision`, `options[]`, `required`, `archived` |
| `activityTypes[]` | `id`, `habitId`, `name`, `icon`, `color`, `fieldIds` (which fields it uses; `null` is all), `defaults` (values for one-tap logging), `order`, `archived` |
| `records[]` | One activity event: `id`, `habitId`, `activityTypeId` (or `null`), `date`, `time`, `tz`, `level` (`full` or `min`), `values[]` (`{fieldId, value, unit}`), `note` |
| `journal[]` | `id`, `kind` (`journal`, or `note` for a note about one habit, whose id is then the only entry in `habitIds`), `date`, `text`, `mood` (1–5 or `null`), `habitIds[]` |
| `reminders[]` | `id`, `habitId`, `time`, `days[]`, `text`, `enabled` |
| `settings` | `theme`, `accent`, `weekStart`, `distanceUnit`, `timeFormat`, `detail` |
| `deleted[]` | `{id, at}`: remembers deletions so merging an older backup does not bring items back |

## Completions are derived

Completions are not stored. They are calculated from the records, which is what prevents double counting:

- **Daily goals** (every day, chosen weekdays, every N days): a scheduled day is complete when it has a full
  record, or, with a daily amount, when the day's records add up to the amount. Two activities on one day
  are two records and one completed day.
- **Weekly and monthly goals**: each full record is a session toward "N times". With a daily amount, a day
  counts once, when it reaches the amount.
- A `min` record makes a day partial unless the habit's minimum is set to count as complete.
- A day that was not scheduled is never a miss.

## CSV export and Google Sheet tabs

Five tables, joined by id:

| File | One row per | Links |
| --- | --- | --- |
| `habits.csv` | habit | |
| `activity_types.csv` | activity type | `habit_id` |
| `activity_records.csv` | activity record | `habit_id`, `activity_type_id` |
| `habit_completions.csv` | day (daily goals) or week/month (weekly and monthly goals) that has activity | `habit_id`, `record_ids` |
| `journal_entries.csv` | journal entry | `habit_ids` |

Structured values are also given as JSON columns (`goals_json`, `fields_json`, `values_json`). The CSV files
are for reading and analysis; restoring uses the JSON backup.

## Merging

Restore offers Replace or Merge. Merge matches items by id and keeps the copy with the later `updatedAt`; a
deletion wins over a copy that was not edited after it. Merging the same backup twice changes nothing.

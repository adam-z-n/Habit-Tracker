# Changelog

## 0.3.0

- Habits: slimmer cards with a smaller name and no icon or reminder bell. Tapping a card shows only Add note,
  Stats and Edit. Habits that still have activity types open the activity picker when a day is tapped.
- Habit editor: name, color, how often, an optional smallest unit (a number and what it counts, e.g. "1
  page"), and Active/Paused/Archived. Icons, the daily amount, activity types, measurements, reminders,
  category, description, start date and Duplicate are gone from the editor; older habits keep what they had.
  The form is tinted with the habit's color, and the palette is softer.
- Stats for a habit: current and longest streak, a month calendar (look only; days no longer open), and its
  notes.
- Journal: one view at a time, chosen from the title menu: the general journal or a habit's notes, each habit
  with its color. A plain list by date, a + to write, and a blank writing page with Cancel (asks before
  discarding) and Save. Opening an entry lets you edit or delete it. Mood, search and filters are gone from
  the screen; moods already saved are kept.
- To-do replaces Progress in the tab bar: several named lists, items ticked off into a Done section, rename
  and delete lists.
- Reminders no longer show in the app, and Settings no longer has a Reminders section. Saved reminders stay
  in the data and backups.
- Deleting a habit keeps its notes as journal entries.
- Data: schema version 3 (to-do lists, structured smallest unit, softer habit colors). Older data and
  backups are upgraded on load. CSV export and the Google Sheet gain `todo_lists` and `todo_items`.

## 0.2.0

- Habits screen shows each habit across the week: a mark per day that can be tapped on or off, the streak,
  the goal, and whether reminders are set. Earlier weeks can be paged to and edited the same way.
- Journal: choose between a journal entry and a note on a habit. Entries can be filtered (all, journal,
  habit notes), narrowed to one habit, sorted newest or oldest first, and searched. A habit's notes also
  show on its stats page, and can be added from its card.
- Data: journal entries have a `kind` (schema version 2). Older data and backups are upgraded on load.

## 0.1.0

First version. See `docs/ROADMAP.md` for what it covers and what comes next.

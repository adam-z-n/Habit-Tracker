# Changelog

## 0.4.3

- Fix: check marks added for days before a habit was created were shown but not counted. A habit starts on
  the day it is made, and earlier days were treated as not due, so "X of Y this week", streaks and the Stats
  calendar left them out. A habit now counts as started on its earliest check mark when that is earlier, so
  back-filled days count everywhere. Existing data is corrected on its own (nothing stored changes).

## 0.4.2

- Habits: under each habit's name, the smallest unit shows with its number in bold (or the schedule when
  there is no smallest unit), and the progress for the week sits on the right of the same line: sessions
  toward a weekly goal ("2 of 3 this week"), or done days out of due days ("4 of 7 this week").

## 0.4.1

- To-do: no + in the corner of an open list; add to-dos with the "Add a to-do" line. The + on the overview
  still creates a list.
- A to-do too long for the screen ends in "…". Tap its text to open it wrapped to full length and edit it;
  Enter or a tap elsewhere closes it again. The ✕ to delete shows while it is open.

## 0.4.0

- To-do opens on an overview of all your lists, each shown as a card in its color with how many to-dos are
  left. Tap one to open it; tapping the To-do tab again comes back to the overview.
- Each list has a color from the same palette as habits, chosen when you create a list and changeable with
  Edit list. An open list tints the screen in its color and shows its name in that color, in bold.
- The menu on the list's name still switches between lists (now with their colors), and adds All lists.
- Data: schema version 4 gives each list a `color`; existing lists get one automatically. The `todo_lists`
  export gains a `color` column.

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
- No more "partly done": a day with anything recorded is done. The dotted circle on the Habits screen, the
  Partly shading in the calendar, and the smallest-unit options when logging an activity are gone. Older
  smallest-unit entries and days short of an old daily amount now count as done, which can lengthen past
  streaks.
- Checked at the iPhone 17 screen size (402×874 points).
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

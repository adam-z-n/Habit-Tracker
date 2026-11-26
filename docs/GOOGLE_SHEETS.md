# Google Sheets backup

The app can keep a copy of your data in a Google Sheet that you own. Each backup writes:

- readable tabs: `habits`, `activity_types`, `activity_records`, `habit_completions`, `journal_entries`,
  `todo_lists`, `todo_items`
  (the same tables as the CSV export), and
- a `_backup` tab holding the complete backup, which is what **Restore from sheet** reads.

There is no Google sign-in inside the app. Instead, a small script attached to your sheet receives the
backup. You set a passphrase in the script so only your app can write to it.

## Setup (about five minutes, best done on a computer)

1. Create a new Google Sheet. Name it anything, for example "Habits backup".
2. In the sheet: **Extensions → Apps Script**.
3. Delete the code shown and paste in the whole of [`apps-script/Code.gs`](../apps-script/Code.gs).
4. Near the top, change `var SECRET = 'change-me';` to a passphrase of your own (keep the quotes). Save.
5. **Deploy → New deployment**. Click the gear and choose **Web app**. Set:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Click **Deploy**. Google asks you to authorize the script to edit your spreadsheets; allow it. (You may see
   an "unverified app" screen because the script is your own: choose Advanced, then continue.)
7. Copy the **Web app URL**. It ends in `/exec`.
8. In the app: **Settings → Google Sheets backup**. Paste the address and the passphrase, tap **Test
   connection**, then **Back up now**. Choose whether to back up automatically.

"Anyone" access means anyone who has the address can reach the script, which is why it checks the
passphrase before doing anything. Treat the address and passphrase like a password. They are stored only on
your device and are never included in exports.

## Restoring

On a new phone or after reinstalling: enter the same address and passphrase in Settings and tap **Restore
from sheet**. The app shows what the backup contains and lets you merge it with what is on the device or
replace it.

## Notes

- Automatic backup runs shortly after changes ("On change") or at most once a day ("Daily"), and when the
  app is opened with changes waiting. It needs a connection; changes made offline are sent later.
- Each backup rewrites the tabs. To keep your own notes or charts in the same spreadsheet, put them on
  other tabs.
- If you change the script later, use **Deploy → Manage deployments → Edit → New version** so the address
  stays the same.

/**
 * Habit tracker backup to Google Sheets.
 *
 * Setup (see docs/GOOGLE_SHEETS.md):
 *   1. Create a Google Sheet. Extensions > Apps Script. Replace the code with this file.
 *   2. Change SECRET below to a passphrase of your own.
 *   3. Deploy > New deployment > Web app. Execute as: Me. Who has access: Anyone.
 *   4. Copy the web app address (ends in /exec) and the passphrase into the app's Settings.
 *
 * Each backup rewrites the readable tabs (habits, activity_types, activity_records,
 * habit_completions, journal_entries) and stores the complete backup in the _backup tab,
 * which is what Restore reads. Do not edit the _backup tab.
 */
var SECRET = 'change-me';

var BACKUP_SHEET = '_backup';
var CHUNK = 40000; // a cell holds at most 50,000 characters

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (SECRET === 'change-me') out = { ok: false, error: 'Set your own SECRET in the script, then deploy a new version.' };
    else if (req.secret !== SECRET) out = { ok: false, error: 'The passphrase does not match the one in the script.' };
    else if (req.action === 'ping') out = { ok: true };
    else if (req.action === 'backup') out = backup(req);
    else if (req.action === 'restore') out = restore();
    else out = { ok: false, error: 'Unknown action.' };
  } catch (err) {
    out = { ok: false, error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Habit tracker backup script is running.');
}

function sheetNamed(book, name) {
  return book.getSheetByName(name) || book.insertSheet(name);
}

function backup(req) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var book = SpreadsheetApp.getActiveSpreadsheet();
    (req.tables || []).forEach(function (table) {
      var sheet = sheetNamed(book, table.name);
      var rows = [table.header].concat(table.rows).map(function (row) {
        return row.map(function (cell) {
          return String(cell);
        });
      });
      sheet.clearContents();
      // Plain text format, so ids, dates and text starting with "=" are stored exactly as sent.
      sheet.getRange(1, 1, rows.length, table.header.length).setNumberFormat('@').setValues(rows);
      sheet.setFrozenRows(1);
    });
    var text = String(req.backup || '');
    var chunks = [['saved_at', req.savedAt || new Date().toISOString()], ['chunks', '']];
    for (var i = 0; i < text.length; i += CHUNK) chunks.push(['', text.substring(i, i + CHUNK)]);
    chunks[1][1] = String(chunks.length - 2);
    var store = sheetNamed(book, BACKUP_SHEET);
    store.clearContents();
    store.getRange(1, 1, chunks.length, 2).setNumberFormat('@').setValues(chunks);
    return { ok: true, savedAt: chunks[0][1] };
  } finally {
    lock.releaseLock();
  }
}

function restore() {
  var store = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(BACKUP_SHEET);
  if (!store || store.getLastRow() < 3) return { ok: true, backup: '' };
  var values = store.getRange(1, 1, store.getLastRow(), 2).getValues();
  var count = Number(values[1][1]);
  var text = '';
  for (var i = 0; i < count; i++) text += String(values[2 + i][1]);
  return { ok: true, savedAt: String(values[0][1]), backup: text };
}

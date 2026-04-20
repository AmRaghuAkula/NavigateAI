// NavigateAI — Lead Capture · Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────
// SETUP (one-time, ~5 minutes)
//
//  1. Go to https://sheets.google.com and create a new blank spreadsheet.
//     Name it something like "NavigateAI Leads".
//
//  2. In the spreadsheet, open  Extensions → Apps Script.
//
//  3. Delete all default code in the editor, paste this entire file, and save
//     (Ctrl+S / Cmd+S). Name the project "NavigateAI Lead Capture".
//
//  4. Click  Deploy → New Deployment
//       Type              : Web App
//       Execute as        : Me  (your Google account)
//       Who has access    : Anyone
//     → Click Deploy.
//
//  5. Grant permissions when prompted (this lets the script write to your sheet).
//
//  6. Copy the Web App URL that appears after deployment.
//
//  7. Paste that URL into LEAD_CONFIG.GOOGLE_SHEET_ENDPOINT in both:
//       • start-a-conversation.html
//       • ai-diagnostic-quiz-v6.html
//
// The script auto-creates two tabs in your spreadsheet:
//   "Contact Form Leads"  — submissions from the discovery intake form
//   "Quiz Leads"          — submissions from the AI readiness diagnostic
//
// To export leads: File → Download → CSV (current sheet) or XLSX (entire sheet).
// ─────────────────────────────────────────────────────────────────────────────

var CONTACT_TAB = 'Contact Form Leads';
var QUIZ_TAB    = 'Quiz Leads';

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss   = SpreadsheetApp.getActiveSpreadsheet();

    if (data.form_type === 'contact') {
      appendContact(ss, data);
    } else if (data.form_type === 'quiz') {
      appendQuiz(ss, data);
    }

    return ContentService
      .createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, error: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function appendContact(ss, d) {
  var sheet = ss.getSheetByName(CONTACT_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CONTACT_TAB);
    var headers = ['Submitted At', 'Name', 'Email', 'Company', 'Phone', 'Preferred Time', 'Context / Message'];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#e8f0fe')
      .setFontColor('#1a237e');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(3, 200);
    sheet.setColumnWidth(7, 400);
  }
  sheet.appendRow([
    d.submitted_at    || new Date().toISOString(),
    d.lead_name       || '',
    d.lead_email      || '',
    d.lead_company    || '',
    d.lead_phone      || '',
    d.preferred_time  || '',
    d.context_message || '',
  ]);
}

function appendQuiz(ss, d) {
  var sheet = ss.getSheetByName(QUIZ_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(QUIZ_TAB);
    var headers = [
      'Submitted At', 'First Name', 'Last Name', 'Email', 'Company',
      'Tier', 'Strategic Clarity %', 'Problem ID %', 'Data Readiness %',
      'Security & Governance %', 'Org Readiness %', 'Average Score %'
    ];
    sheet.appendRow(headers);
    sheet.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#e8f0fe')
      .setFontColor('#1a237e');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 160);
    sheet.setColumnWidth(4, 200);
  }
  sheet.appendRow([
    d.submitted_at    || new Date().toISOString(),
    d.first_name      || '',
    d.last_name       || '',
    d.lead_email      || '',
    d.lead_company    || '',
    d.tier            || '',
    d.score_strategy  || 0,
    d.score_problems  || 0,
    d.score_data      || 0,
    d.score_security  || 0,
    d.score_org       || 0,
    d.avg_score       || 0,
  ]);
}

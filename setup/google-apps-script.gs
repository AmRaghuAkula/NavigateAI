// NavigateAI — Lead Capture · Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────
// SETUP (one-time, ~5 minutes)
//
//  1. Go to https://sheets.google.com and create a new blank spreadsheet.
//     Name it something like "NavigateAI Leads".
//
//  2. In the spreadsheet, open  Extensions → Apps Script.
//
//  3. Delete all default code, paste this entire file, and save (Ctrl+S).
//     Name the project "NavigateAI Lead Capture".
//
//  4. IMPORTANT — set your shared secret:
//     Change SUBMIT_SECRET below to any long random string you choose,
//     e.g.  "nai-2026-xK9mPqR7vLw3"
//     Then copy that exact string into LEAD_CONFIG.SHEET_SECRET in both
//     start-a-conversation.html and ai-diagnostic-quiz-v6.html.
//     This ensures only your pages can write to your sheet.
//
//  5. Click  Deploy → New Deployment
//       Type              : Web App
//       Execute as        : Me  (your Google account)
//       Who has access    : Anyone
//     → Click Deploy.
//
//  6. Grant permissions when prompted.
//
//  7. Copy the Web App URL and paste it into LEAD_CONFIG.GOOGLE_SHEET_ENDPOINT
//     in both HTML files.
//
// The script auto-creates two tabs:
//   "Contact Form Leads"  — discovery intake form submissions
//   "Quiz Leads"          — AI readiness diagnostic submissions
//
// Export: File → Download → CSV (current sheet) or XLSX (entire workbook).
// ─────────────────────────────────────────────────────────────────────────────

// ── Change this to your own secret string ──────────────────────────────────
var SUBMIT_SECRET = 'REPLACE_WITH_YOUR_OWN_SECRET';
// ───────────────────────────────────────────────────────────────────────────

var CONTACT_TAB      = 'Contact Form Leads';
var QUIZ_TAB         = 'Quiz Leads';
var RATE_LIMIT_MINS  = 5;   // block same email re-submitting within 5 minutes

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);

    // ── 1. Secret check — reject anything that doesn't know the secret ──
    if (data.secret !== SUBMIT_SECRET) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // ── 2. Rate limit — prevent the same email spamming submissions ─────
    if (data.lead_email && isRateLimited(data.lead_email)) {
      return ContentService
        .createTextOutput(JSON.stringify({ success: false, error: 'Rate limited' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var ss = SpreadsheetApp.getActiveSpreadsheet();

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

// ── Rate limiting via PropertiesService (server-side, not spoofable) ────────
function isRateLimited(email) {
  var store = PropertiesService.getScriptProperties();
  var key   = 'rl_' + email.toLowerCase().replace(/[^a-z0-9]/g, '_');
  var last  = store.getProperty(key);
  var now   = Date.now();
  if (last && (now - parseInt(last)) < RATE_LIMIT_MINS * 60 * 1000) {
    return true;
  }
  store.setProperty(key, String(now));
  return false;
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
    d.submitted_at   || new Date().toISOString(),
    d.first_name     || '',
    d.last_name      || '',
    d.lead_email     || '',
    d.lead_company   || '',
    d.tier           || '',
    d.score_strategy || 0,
    d.score_problems || 0,
    d.score_data     || 0,
    d.score_security || 0,
    d.score_org      || 0,
    d.avg_score      || 0,
  ]);
}

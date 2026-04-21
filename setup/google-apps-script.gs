// NavigateAI — AI Readiness Report Engine · Google Apps Script
// ─────────────────────────────────────────────────────────────────────────────
// SETUP (one-time, ~10 minutes)
//
//  1. Create a blank Google Sheet. Name it "NavigateAI Leads".
//
//  2. Open Extensions → Apps Script. Delete default code, paste this file.
//     Name the project "NavigateAI Report Engine".
//
//  3. Set Script Properties (Project Settings → Script Properties):
//       SUBMIT_SECRET   →  copy from LEAD_CONFIG.SHEET_SECRET in the HTML file
//       CLAUDE_API_KEY  →  sk-ant-api03-... (from console.anthropic.com)
//       ADMIN_EMAIL     →  your@email.com (receives lead notifications)
//
//  4. Deploy → New Deployment
//       Type: Web App | Execute as: Me | Who has access: Anyone
//     Copy the Web App URL → paste into LEAD_CONFIG.GOOGLE_SHEET_ENDPOINT in HTML.
//
//  5. Re-deploy (new version) every time you edit this script.
// ─────────────────────────────────────────────────────────────────────────────

var CONTACT_TAB     = 'Contact Form Leads';
var QUIZ_TAB        = 'Quiz Leads';
var RATE_LIMIT_MINS = 5;

// Question metadata — mirrors the quiz exactly (Q1–Q29)
var QUESTIONS = [
  // Strategic Clarity (0–4)
  {s:'Strategic Clarity',        q:'How clearly defined are your core business processes today? Are they documented, or do they mostly live in people\'s heads?'},
  {s:'Strategic Clarity',        q:'When your leadership team talks about AI, what outcomes are you actually trying to achieve — and can you tie those to a specific business metric?'},
  {s:'Strategic Clarity',        q:'How does your organisation make important decisions today — is there one clear decision-maker, or does everything require team consensus?'},
  {s:'Strategic Clarity',        q:'Have you allocated — or are you actively planning to allocate — a budget specifically for AI?'},
  {s:'Strategic Clarity',        q:'Is there a specific leader who owns the AI agenda — with both the authority and the appetite to drive it forward?'},
  // Problem Identification (5–9)
  {s:'Problem Identification',   q:'Walk us through the most repetitive, manual tasks your team does every week. Name the task, who does it, and roughly how long it takes.'},
  {s:'Problem Identification',   q:'Are there decisions in your business that feel slow, risky, or inconsistent because the right information isn\'t available at the right time?'},
  {s:'Problem Identification',   q:'Where does content creation, communication, or knowledge work slow you down — writing, summarising, translating, or explaining things repeatedly?'},
  {s:'Problem Identification',   q:'Are there complex, multi-step workflows involving coordination across multiple tools, people, or systems?'},
  {s:'Problem Identification',   q:'Have you — or has your team — ever tried to solve any of these problems before? What happened, and what did you learn?'},
  // Data Readiness (10–14)
  {s:'Data Readiness',           q:'If an AI assistant needed to understand how your organisation works — processes, customers, decisions — where would it find that information today?'},
  {s:'Data Readiness',           q:'How centralised is your operational data — customer records, transactions, performance metrics — or is it spread across disconnected tools?'},
  {s:'Data Readiness',           q:'How clean, consistent, and up-to-date is your data? Are there known quality issues your team works around?'},
  {s:'Data Readiness',           q:'Is there clear ownership of your key data assets — does someone know what you have, where it lives, and who keeps it accurate?'},
  {s:'Data Readiness',           q:'Does your organisation use any analytics or reporting tools — and do leaders actually use the outputs to make decisions?'},
  // Security & Governance (15–19)
  {s:'Security & Governance',    q:'Does your organisation have a data privacy policy — and has it been reviewed with AI tool usage specifically in mind?'},
  {s:'Security & Governance',    q:'What compliance or regulatory obligations apply to your organisation — and do you know which AI vendors are certified to meet them?'},
  {s:'Security & Governance',    q:'How is access to your most sensitive data — customer records, financials, employee information — controlled within your organisation?'},
  {s:'Security & Governance',    q:'When you bring in an AI tool, do you know whether your data could be used to train the vendor\'s models — and have you checked the terms?'},
  {s:'Security & Governance',    q:'Who in your organisation actively owns data security day-to-day — and are they empowered to say no to a non-compliant tool?'},
  // Org Readiness (20–24)
  {s:'Org Readiness',            q:'How does your team typically respond when a new process or tool is introduced — and has that changed as AI tools have become more visible?'},
  {s:'Org Readiness',            q:'Think about the last time your organisation successfully adopted a new tool or changed a core process. What made it work — or not work?'},
  {s:'Org Readiness',            q:'Do you have access to technical support — internal or external — who understands AI tools and could help you design, test, and deploy them?'},
  {s:'Org Readiness',            q:'Are your employees already using AI tools — even informally — in their day-to-day work? What does that look like in practice?'},
  {s:'Org Readiness',            q:'Once you deploy an AI initiative, how will you know it\'s working? Do you have a way to measure success before you start?'},
  // Context (25)
  {s:'Your Context',             q:'Is there anything important about your organisation, your industry, or your AI ambitions that our questions haven\'t captured?'},
  // Partnership (26–28)
  {s:'How We Can Help',          q:'Where do you feel you\'d most benefit from outside perspective — shaping strategy, selecting tools, or hands-on implementation support?'},
  {s:'How We Can Help',          q:'If the right guidance were available, how would you prefer to engage — a structured programme, advisory conversations, or a self-serve framework?'},
  {s:'How We Can Help',          q:'Would you be open to a short, no-obligation conversation to explore whether there\'s a fit?'},
];

// ─────────────────────────────────────────────────────────────────────────────
// HTTP HANDLERS
// ─────────────────────────────────────────────────────────────────────────────

function doGet(e) {
  try {
    var p = e.parameter;
    var secret = PropertiesService.getScriptProperties().getProperty('SUBMIT_SECRET');
    if (p.secret !== secret) return jsonOut({success:false, error:'Unauthorized'});
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    if (p.form_type === 'contact') appendContact(ss, p);
    else if (p.form_type === 'quiz') appendQuiz(ss, p);
    return jsonOut({success:true});
  } catch(err) {
    return jsonOut({success:false, error:err.message});
  }
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SUBMIT_SECRET');

    if (data.secret !== secret) return jsonOut({success:false, error:'Unauthorized'});
    if (data.lead_email && isRateLimited(data.lead_email)) return jsonOut({success:false, error:'Rate limited'});

    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.form_type === 'contact') {
      appendContact(ss, data);
      return jsonOut({success:true});
    }

    if (data.form_type === 'quiz') {
      appendQuiz(ss, data);
      try {
        var analysis = callClaude(data.answers || [], data);
        if (analysis) {
          var html = generateHTMLReport(analysis, data);
          sendReportEmail(data.lead_email, data.first_name, data.last_name, data.lead_company, html);
          sendAdminNotification(data, analysis);
        }
      } catch(claudeErr) {
        Logger.log('Claude error: ' + claudeErr.message);
      }
      return jsonOut({success:true});
    }

    return jsonOut({success:false, error:'Unknown form_type'});
  } catch(err) {
    return jsonOut({success:false, error:err.message});
  }
}

function jsonOut(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAUDE API
// ─────────────────────────────────────────────────────────────────────────────

function callClaude(answers, userData) {
  var props   = PropertiesService.getScriptProperties();
  var apiKey  = props.getProperty('CLAUDE_API_KEY');
  if (!apiKey) { Logger.log('CLAUDE_API_KEY not set'); return null; }

  var prompt  = buildPrompt(answers, userData);
  var payload = { model:'claude-sonnet-4-6', max_tokens:4096,
                  messages:[{role:'user', content:prompt}] };

  var resp = UrlFetchApp.fetch('https://api.anthropic.com/v1/messages', {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });

  if (resp.getResponseCode() !== 200) {
    Logger.log('Claude HTTP ' + resp.getResponseCode() + ': ' + resp.getContentText().substring(0,400));
    return null;
  }

  var text = JSON.parse(resp.getContentText()).content[0].text;

  // Extract JSON block from Claude's response
  var m = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (m) return JSON.parse(m[1]);
  try { return JSON.parse(text); } catch(e) {
    Logger.log('JSON parse failed: ' + text.substring(0,400));
    return null;
  }
}

function buildPrompt(answers, userData) {
  // Build Q&A section for scored dimensions (Q1–Q25)
  var qa = '';
  for (var i = 0; i < 25; i++) {
    qa += '\n[Q' + (i+1) + '] ' + QUESTIONS[i].s + ' — ' + QUESTIONS[i].q +
          '\nAnswer: ' + (answers[i] || '').trim() + '\n';
  }

  var context     = (answers[25] || '').trim() || 'Not provided.';
  var partnership = '';
  for (var j = 26; j < 29; j++) {
    partnership += QUESTIONS[j].q + '\nAnswer: ' + (answers[j] || '').trim() + '\n';
  }

  return 'You are a senior AI strategy consultant. Produce a consulting-grade AI readiness assessment for the following client.\n\n' +
'## Client\n' +
'Name: ' + userData.first_name + ' ' + userData.last_name + '\n' +
'Company: ' + userData.lead_company + '\n' +
'Date: ' + (userData.submitted_at || new Date().toISOString()) + '\n\n' +
'## Assessment Responses\n\n' +
'### SCORED DIMENSIONS (Q1–Q25)\n' + qa + '\n' +
'### INDUSTRY CONTEXT (Q26)\n' + context + '\n\n' +
'### PARTNERSHIP PREFERENCES (Q27–29)\n' + partnership + '\n' +
'---\n\n' +
'Return ONLY a single JSON block wrapped in ```json ... ``` with this exact structure:\n\n' +
'```json\n' +
'{\n' +
'  "tier": "AI Leader | AI Builder | AI Explorer | AI Beginner",\n' +
'  "tier_rationale": "2–3 sentence honest rationale grounded in their actual answers",\n' +
'  "overall_score": <integer 0–100>,\n' +
'  "dimensions": {\n' +
'    "strategic_clarity":      { "score":<0-100>, "label":"Strong|Developing|Needs Work", "headline":"<one sharp sentence>", "strengths":["...","..."], "gaps":["...","..."], "narrative":"<2–3 paragraph consulting analysis referencing what they actually said>" },\n' +
'    "problem_identification": { <same structure> },\n' +
'    "data_readiness":         { <same structure> },\n' +
'    "security_governance":    { <same structure> },\n' +
'    "org_readiness":          { <same structure> }\n' +
'  },\n' +
'  "framework_entry_point": { "stage":<1-7>, "stage_name":"<name>", "rationale":"<2–3 sentences>" },\n' +
'  "priority_actions": [\n' +
'    { "rank":1, "action":"<specific title>", "why":"<why #1 for this client>", "how":"<concrete first steps>", "timeframe":"0–30 days|30–90 days|90+ days" },\n' +
'    { "rank":2, <same> },\n' +
'    { "rank":3, <same> }\n' +
'  ],\n' +
'  "risk_flags": [\n' +
'    { "flag":"<title>", "severity":"High|Medium|Low", "description":"<specific to what they said>" }\n' +
'  ],\n' +
'  "tool_recommendations": [\n' +
'    { "category":"<e.g. Knowledge Management>", "recommendation":"<specific tool>", "rationale":"<why it fits their situation>" }\n' +
'  ],\n' +
'  "executive_summary": "<3–4 sentences for a C-suite reader. Direct, specific, name what is strong and what is at risk.>",\n' +
'  "consultant_note": "<2–3 sentence personal note to ' + userData.first_name + '. Human tone. Reference something specific from their answers.>"\n' +
'}\n' +
'```\n\n' +
'## Scoring rubric\n' +
'75–100: Mature practices, named owners, specific metrics, documented processes\n' +
'50–74: Partial evidence — some practices in place but gaps in coverage or ownership\n' +
'25–49: Aspirational intent, limited infrastructure\n' +
'0–24: Early stage, vague answers, no clear ownership\n\n' +
'## Tier thresholds (average of 5 dimension scores)\n' +
'AI Leader ≥72 | AI Builder ≥52 | AI Explorer ≥32 | AI Beginner <32\n\n' +
'## Non-negotiable rules\n' +
'1. Be SPECIFIC — quote or paraphrase phrases from their actual answers.\n' +
'2. Be HONEST — if a dimension is weak, say so clearly and constructively.\n' +
'3. Be ACTIONABLE — every recommendation must be executable next week.\n' +
'4. Do NOT invent capabilities or practices they have not mentioned.\n' +
'5. The consultant_note must feel like it came from a human who read every word.';
}

// ─────────────────────────────────────────────────────────────────────────────
// HTML REPORT GENERATOR
// ─────────────────────────────────────────────────────────────────────────────

function generateHTMLReport(a, u) {
  var tierColors = {'AI Leader':'#2e7d5a','AI Builder':'#38b5bc','AI Explorer':'#c9a84c','AI Beginner':'#c07040'};
  var tc = tierColors[a.tier] || '#38b5bc';

  var DIM_ORDER  = ['strategic_clarity','problem_identification','data_readiness','security_governance','org_readiness'];
  var DIM_LABELS = {
    strategic_clarity:      '🧭 Strategic Clarity',
    problem_identification: '🔍 Problem Identification',
    data_readiness:         '📊 Data Readiness',
    security_governance:    '🔐 Security & Governance',
    org_readiness:          '🚀 Org Readiness'
  };

  function scoreColor(n) { return n >= 65 ? '#2e7d5a' : n >= 40 ? '#38b5bc' : '#c9a84c'; }

  // ── Score bar row
  function scoreBar(key) {
    var d = a.dimensions[key]; if (!d) return '';
    var sc = scoreColor(d.score);
    return '<tr>' +
      '<td style="padding:10px 12px 10px 0;font-size:13px;color:#333;white-space:nowrap;width:180px;">' + DIM_LABELS[key] + '</td>' +
      '<td style="padding:10px 0;"><div style="background:#e8e8e8;border-radius:4px;height:10px;"><div style="background:' + sc + ';width:' + d.score + '%;height:10px;border-radius:4px;"></div></div></td>' +
      '<td style="padding:10px 0 10px 12px;font-weight:700;color:' + sc + ';font-size:14px;white-space:nowrap;width:48px;">' + d.score + '%</td>' +
    '</tr>';
  }

  // ── Dimension card
  function dimCard(key) {
    var d = a.dimensions[key]; if (!d) return '';
    var sc = scoreColor(d.score);
    var strengths = (d.strengths||[]).map(function(s){return '<li style="margin-bottom:5px;">'+s+'</li>';}).join('');
    var gaps      = (d.gaps||[]).map(function(g){return '<li style="margin-bottom:5px;">'+g+'</li>';}).join('');
    var narrative = (d.narrative||'').split(/\n\n+/).map(function(p){
      return '<p style="margin:0 0 12px;font-size:14px;line-height:1.75;color:#333;">'+p+'</p>';
    }).join('');

    return '<div style="border-left:4px solid '+sc+';background:#f9f9fb;border-radius:0 6px 6px 0;padding:22px 24px;margin-bottom:24px;">' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td><h3 style="margin:0;font-size:17px;color:#1a1a2e;">'+DIM_LABELS[key]+'</h3></td>' +
        '<td align="right">' +
          '<span style="background:'+sc+';color:#fff;border-radius:20px;padding:4px 14px;font-weight:700;font-size:15px;">'+d.score+'%</span><br>' +
          '<span style="font-size:11px;color:#888;">'+( d.label||'')+'</span>' +
        '</td>' +
      '</tr></table>' +
      '<p style="margin:12px 0 16px;font-size:14px;font-style:italic;color:#555;">'+( d.headline||'')+'</p>' +
      '<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>' +
        '<td width="50%" valign="top" style="padding-right:12px;">' +
          '<div style="font-size:12px;font-weight:700;color:#2e7d5a;letter-spacing:.5px;margin-bottom:8px;">✓ STRENGTHS</div>' +
          '<ul style="margin:0;padding-left:16px;color:#333;font-size:13px;">'+strengths+'</ul>' +
        '</td>' +
        '<td width="50%" valign="top" style="padding-left:12px;">' +
          '<div style="font-size:12px;font-weight:700;color:#c07040;letter-spacing:.5px;margin-bottom:8px;">⚠ GAPS</div>' +
          '<ul style="margin:0;padding-left:16px;color:#333;font-size:13px;">'+gaps+'</ul>' +
        '</td>' +
      '</tr></table>' +
      '<div style="margin-top:16px;">'+narrative+'</div>' +
    '</div>';
  }

  // ── Priority action card
  var rankColors = ['#c07040','#38b5bc','#2e7d5a'];
  var actions = (a.priority_actions||[]).map(function(act) {
    var rc = rankColors[(act.rank||1)-1] || '#38b5bc';
    return '<div style="background:#fff;border:1px solid #e0e0e0;border-radius:6px;padding:20px;margin-bottom:14px;">' +
      '<table cellpadding="0" cellspacing="0" border="0" width="100%"><tr>' +
        '<td width="36" valign="top">' +
          '<div style="background:'+rc+';color:#fff;width:28px;height:28px;border-radius:50%;text-align:center;line-height:28px;font-weight:700;font-size:14px;">'+act.rank+'</div>' +
        '</td>' +
        '<td valign="top" style="padding-left:10px;">' +
          '<div style="font-weight:700;font-size:15px;color:#1a1a2e;margin-bottom:2px;">'+act.action+'</div>' +
          '<span style="background:#f0f0f0;padding:2px 9px;border-radius:10px;font-size:11px;color:#666;">'+act.timeframe+'</span>' +
        '</td>' +
      '</tr></table>' +
      '<div style="margin-top:12px;font-size:13px;color:#333;"><strong>Why:</strong> '+act.why+'</div>' +
      '<div style="margin-top:8px;font-size:13px;color:#333;"><strong>How to start:</strong> '+act.how+'</div>' +
    '</div>';
  }).join('');

  // ── Risk flags
  var riskBg = {High:'#fff5f0',Medium:'#fffbf0',Low:'#f0faff'};
  var riskBorder = {High:'#c07040',Medium:'#c9a84c',Low:'#38b5bc'};
  var risks = (a.risk_flags||[]).map(function(r) {
    var rb = riskBorder[r.severity]||'#c9a84c';
    return '<div style="background:'+(riskBg[r.severity]||'#fffbf0')+';border-left:3px solid '+rb+';padding:14px 16px;margin-bottom:10px;border-radius:0 4px 4px 0;">' +
      '<span style="background:'+rb+';color:#fff;font-size:11px;font-weight:700;padding:2px 8px;border-radius:10px;letter-spacing:.3px;">'+r.severity.toUpperCase()+'</span>' +
      '<strong style="font-size:14px;color:#1a1a2e;margin-left:10px;">'+r.flag+'</strong>' +
      '<p style="margin:8px 0 0;font-size:13px;color:#555;">'+r.description+'</p>' +
    '</div>';
  }).join('');

  // ── Tool recommendations
  var tools = (a.tool_recommendations||[]).map(function(t) {
    return '<div style="background:#fff;border:1px solid #e8e8e8;border-radius:6px;padding:16px;margin-bottom:10px;">' +
      '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#888;margin-bottom:4px;">'+t.category+'</div>' +
      '<div style="font-weight:600;font-size:15px;color:#1a1a2e;margin-bottom:6px;">'+t.recommendation+'</div>' +
      '<div style="font-size:13px;color:#555;">'+t.rationale+'</div>' +
    '</div>';
  }).join('');

  var ep = a.framework_entry_point || {};

  var scoreRows = DIM_ORDER.map(scoreBar).join('');
  var dimCards  = DIM_ORDER.map(dimCard).join('');

  return '<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI Readiness Report — ' + u.lead_company + '</title></head>' +
  '<body style="margin:0;padding:0;background:#f2f2f6;font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Arial,sans-serif;">' +

  // Header
  '<div style="background:#0f0f1a;padding:28px 40px;">' +
    '<div style="max-width:680px;margin:0 auto;">' +
      '<div style="color:#6c8ebf;font-size:11px;letter-spacing:2.5px;text-transform:uppercase;margin-bottom:6px;">AI READINESS ASSESSMENT REPORT</div>' +
      '<div style="color:#fff;font-size:22px;font-weight:700;">NavigateAI</div>' +
      '<div style="color:#888;font-size:12px;margin-top:4px;">'+u.lead_company+' &nbsp;·&nbsp; '+(u.submitted_at||'')+'</div>' +
    '</div>' +
  '</div>' +

  // Tier banner
  '<div style="background:'+tc+';padding:28px 40px;">' +
    '<div style="max-width:680px;margin:0 auto;">' +
      '<div style="color:rgba(255,255,255,0.75);font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">READINESS TIER</div>' +
      '<div style="color:#fff;font-size:30px;font-weight:800;margin-bottom:10px;">'+a.tier+'</div>' +
      '<div style="color:rgba(255,255,255,0.9);font-size:15px;line-height:1.65;">'+( a.tier_rationale||'')+'</div>' +
      '<div style="display:inline-block;background:rgba(255,255,255,0.18);color:#fff;border-radius:24px;padding:8px 20px;font-size:17px;font-weight:700;margin-top:16px;">Overall Score: '+a.overall_score+' / 100</div>' +
    '</div>' +
  '</div>' +

  '<div style="max-width:680px;margin:0 auto;padding:32px 20px;">' +

  // Executive Summary
  '<div style="background:#1a1a2e;border-radius:8px;padding:28px;margin-bottom:32px;">' +
    '<div style="color:#6c8ebf;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:12px;">EXECUTIVE SUMMARY</div>' +
    '<p style="color:#e8e8f4;font-size:16px;line-height:1.8;margin:0 0 20px;">'+( a.executive_summary||'')+'</p>' +
    '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:16px;">' +
      '<div style="color:#888;font-size:11px;letter-spacing:1px;text-transform:uppercase;margin-bottom:8px;">A NOTE FROM YOUR CONSULTANT</div>' +
      '<p style="color:#c8c8d8;font-size:14px;line-height:1.75;margin:0;font-style:italic;">'+( a.consultant_note||'')+'</p>' +
    '</div>' +
  '</div>' +

  // Score overview
  '<h2 style="font-size:18px;color:#1a1a2e;margin:0 0 14px;font-weight:700;">Dimension Scores</h2>' +
  '<div style="background:#fff;border-radius:8px;padding:16px 20px;margin-bottom:32px;">' +
    '<table width="100%" cellpadding="0" cellspacing="0" border="0">'+scoreRows+'</table>' +
  '</div>' +

  // Detailed analysis
  '<h2 style="font-size:18px;color:#1a1a2e;margin:0 0 14px;font-weight:700;">Detailed Analysis</h2>' +
  dimCards +

  // Priority actions
  '<h2 style="font-size:18px;color:#1a1a2e;margin:32px 0 14px;font-weight:700;">Priority Action Plan</h2>' +
  actions +

  // Risk flags
  (risks ? '<h2 style="font-size:18px;color:#1a1a2e;margin:32px 0 14px;font-weight:700;">Risk Flags</h2>' + risks : '') +

  // Tools
  (tools ? '<h2 style="font-size:18px;color:#1a1a2e;margin:32px 0 14px;font-weight:700;">Tool & Vendor Recommendations</h2>' + tools : '') +

  // Framework entry
  '<div style="background:#edf7f1;border:1px solid #b8dcc8;border-radius:8px;padding:24px;margin:32px 0;">' +
    '<div style="color:#2e7d5a;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-bottom:8px;">RECOMMENDED FRAMEWORK ENTRY POINT</div>' +
    '<div style="font-size:20px;font-weight:700;color:#1a1a2e;margin-bottom:8px;">Stage '+(ep.stage||'')+': '+(ep.stage_name||'')+'</div>' +
    '<p style="font-size:14px;color:#444;line-height:1.7;margin:0;">'+(ep.rationale||'')+'</p>' +
  '</div>' +

  // Footer
  '<div style="border-top:1px solid #e0e0e0;margin-top:32px;padding-top:20px;text-align:center;">' +
    '<div style="color:#666;font-size:13px;">Generated by <a href="https://amraghuakula.github.io/NavigateAI/" style="color:#38b5bc;text-decoration:none;">NavigateAI</a></div>' +
    '<div style="color:#aaa;font-size:12px;margin-top:6px;">Confidential — prepared for '+u.first_name+' '+u.last_name+' at '+u.lead_company+'</div>' +
  '</div>' +

  '</div></body></html>';
}

// ─────────────────────────────────────────────────────────────────────────────
// EMAIL DELIVERY
// ─────────────────────────────────────────────────────────────────────────────

function sendReportEmail(toEmail, firstName, lastName, company, html) {
  MailApp.sendEmail({
    to: toEmail,
    subject: 'Your AI Readiness Assessment Report — ' + company,
    htmlBody: html,
    name: 'NavigateAI'
  });
}

function sendAdminNotification(data, analysis) {
  var props = PropertiesService.getScriptProperties();
  var adminEmail = props.getProperty('ADMIN_EMAIL');
  if (!adminEmail) return;

  var dims = analysis.dimensions || {};
  function ds(key) { return dims[key] ? dims[key].score + '%' : 'n/a'; }

  var body =
    'New AI Readiness Assessment\n\n' +
    'Name:    ' + data.first_name + ' ' + data.last_name + '\n' +
    'Email:   ' + data.lead_email + '\n' +
    'Company: ' + data.lead_company + '\n' +
    'Tier:    ' + analysis.tier + ' (' + analysis.overall_score + '/100)\n\n' +
    'Scores:\n' +
    '  Strategic Clarity:      ' + ds('strategic_clarity') + '\n' +
    '  Problem Identification: ' + ds('problem_identification') + '\n' +
    '  Data Readiness:         ' + ds('data_readiness') + '\n' +
    '  Security & Governance:  ' + ds('security_governance') + '\n' +
    '  Org Readiness:          ' + ds('org_readiness') + '\n\n' +
    'Summary:\n' + (analysis.executive_summary || '') + '\n\n' +
    'Reply-to: ' + data.lead_email;

  MailApp.sendEmail({
    to: adminEmail,
    subject: 'NavigateAI Lead: ' + data.first_name + ' ' + data.last_name + ' (' + analysis.tier + ')',
    body: body,
    name: 'NavigateAI'
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// RATE LIMITING
// ─────────────────────────────────────────────────────────────────────────────

function isRateLimited(email) {
  var store = PropertiesService.getScriptProperties();
  var key   = 'rl_' + email.toLowerCase().replace(/[^a-z0-9]/g,'_');
  var last  = store.getProperty(key);
  var now   = Date.now();
  if (last && (now - parseInt(last)) < RATE_LIMIT_MINS * 60 * 1000) return true;
  store.setProperty(key, String(now));
  return false;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHEET LOGGING
// ─────────────────────────────────────────────────────────────────────────────

function appendContact(ss, d) {
  var sheet = ss.getSheetByName(CONTACT_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(CONTACT_TAB);
    var h = ['Submitted At','Name','Email','Company','Phone','Preferred Time','Context / Message'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#e8f0fe').setFontColor('#1a237e');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1,160); sheet.setColumnWidth(3,200); sheet.setColumnWidth(7,400);
  }
  sheet.appendRow([d.submitted_at||new Date().toISOString(), d.lead_name||'', d.lead_email||'',
    d.lead_company||'', d.lead_phone||'', d.preferred_time||'', d.context_message||'']);
}

function appendQuiz(ss, d) {
  var sheet = ss.getSheetByName(QUIZ_TAB);
  if (!sheet) {
    sheet = ss.insertSheet(QUIZ_TAB);
    var h = ['Submitted At','First Name','Last Name','Email','Company',
             'Tier','Strategic Clarity %','Problem ID %','Data Readiness %',
             'Security & Governance %','Org Readiness %','Average Score %'];
    sheet.appendRow(h);
    sheet.getRange(1,1,1,h.length).setFontWeight('bold').setBackground('#e8f0fe').setFontColor('#1a237e');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1,160); sheet.setColumnWidth(4,200);
  }
  sheet.appendRow([d.submitted_at||new Date().toISOString(), d.first_name||'', d.last_name||'',
    d.lead_email||'', d.lead_company||'', d.tier||'',
    d.score_strategy||0, d.score_problems||0, d.score_data||0,
    d.score_security||0, d.score_org||0, d.avg_score||0]);
}

'use strict';

// One-click opt-out from the footer of every enquiry email.
// GET /api/enquiry/unsubscribe?e=<ref>&t=<signature>
//
// The response is a small self-contained page — no site partials, no CSS
// file, nothing that could fail to load for someone arriving from a mail
// client. Nothing rendered here comes from the request, so there is no
// injection surface.

const store = require('../_lib/store');
const { verifyRef } = require('../_lib/enquiry');
const { cleanText } = require('../_lib/util');

function page(eyebrow, heading, body) {
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
'<meta name="robots" content="noindex, nofollow">\n' +
'<title>' + heading + ' · Scotty Massa</title>\n' +
'<style>\n' +
':root{color-scheme:dark}\n' +
'*{box-sizing:border-box}\n' +
'body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:32px 20px;background:#0A0A0A;color:#C8C5BF;font-family:-apple-system,"Segoe UI",Arial,sans-serif;font-size:16px;line-height:1.7}\n' +
'.card{width:100%;max-width:520px;border:1px solid rgba(245,242,236,0.14);padding:40px 32px}\n' +
'.mark{width:56px;height:56px;border:1px solid #E8B653;color:#E8B653;display:flex;align-items:center;justify-content:center;font-family:Georgia,"Times New Roman",serif;font-size:18px;letter-spacing:.14em;margin-bottom:28px}\n' +
'.eyebrow{margin:0 0 10px;font-size:11px;letter-spacing:.3em;text-transform:uppercase;color:#8C8A85}\n' +
'h1{margin:0 0 18px;font-family:Georgia,"Times New Roman",serif;font-weight:400;font-size:26px;line-height:1.3;color:#F5F2EC}\n' +
'p{margin:0 0 16px}\n' +
'.foot{margin:28px 0 0;padding-top:20px;border-top:1px solid #242424;font-size:13px;color:#8C8A85}\n' +
'a{color:#E8B653}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<main class="card">\n' +
'<div class="mark">SM</div>\n' +
'<p class="eyebrow">' + eyebrow + '</p>\n' +
'<h1>' + heading + '</h1>\n' +
body + '\n' +
'<p class="foot">Scotty Massa · Birkirkara, Malta<br><a href="https://scottymassa.com/">scottymassa.com</a></p>\n' +
'</main>\n' +
'</body>\n' +
'</html>\n';
}

const DONE = page('Unsubscribed', 'You are off the list.',
  '<p>I will not send you any more emails about your tattoo enquiry.</p>' +
  '<p>If you would like to pick the conversation back up, email ' +
  '<a href="mailto:studio@scottymassa.com">studio@scottymassa.com</a> and I will take it from there.</p>');

const BAD_LINK = page('Unsubscribe', 'That link did not work.',
  '<p>The link looks incomplete or has expired, so I cannot tell which enquiry it belongs to.</p>' +
  '<p>Email <a href="mailto:studio@scottymassa.com">studio@scottymassa.com</a> and I will take you off the list myself.</p>');

function send(res, statusCode, html) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.end(html);
}

module.exports = async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET');
    send(res, 405, BAD_LINK);
    return;
  }

  try {
    const url = new URL(req.url || '/', 'https://scottymassa.com');
    const ref = cleanText(url.searchParams.get('e'), 40);
    const sig = cleanText(url.searchParams.get('t'), 64);

    // verifyRef is total: a malformed ref, a missing signature and an
    // unconfigured secret all return false rather than throwing.
    if (!ref || !verifyRef(ref, sig)) {
      send(res, 400, BAD_LINK);
      return;
    }

    // Best-effort, exactly as everywhere else: with no store configured the
    // opt-out still has to read as done to the person who clicked.
    try {
      if (store.isConfigured()) await store.markUnsubscribed(ref);
    } catch (err) {
      console.error('[enquiry/unsubscribe] could not record the opt-out for ' + ref, err);
    }

    send(res, 200, DONE);
  } catch (err) {
    console.error('[enquiry/unsubscribe] unexpected failure', err);
    send(res, 400, BAD_LINK);
  }
};

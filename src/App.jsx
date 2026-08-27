import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Lock, Unlock, Phone, Mail, Clock, ExternalLink, Search,
  ChevronLeft, ChevronRight, RefreshCw, Shield, User, MessageSquare, Download, Info
} from "lucide-react";

/* =========================================================================
   APPOINTMENT SETTER BOARD  —  LifeSource
   -------------------------------------------------------------------------
   PRODUCTION WIRING (seams marked // PROD: ...):
   1. DATA: replace SEED with a fetch() of the untouched-leads endpoint.
      The deployed Static Web App can reach it; this preview sandbox cannot.
   2. CLAIM STORE: claims live in component state here (prototype). In prod,
      persist to a shared store (Azure Table Storage via a managed Function)
      so every setter sees the same locks. Contract is at saveClaim/loadClaims.
      No CRM write-back, per spec. Last-write-wins is acceptable.
   3. IDENTITY: currentUser is a switcher here. In prod it's the Entra SSO
      identity — claims record the logged-in user automatically.
   4. ROSTER: BRANCH_BY_REP is a stub. Swap in the real rep→branch roster.
   5. LOST: LOST_STATUS_IDS is a stub — confirm the lost status_id from the
      Sales Rep dash carries over to this endpoint.
   6. sLEADS / COMMERCIAL: isSLead() and isCommercial() are no-op stubs until
      we get the field/marker that identifies them.
   7. CRM_RECORD_URL: deep-link template for the "Book in CRM" button.
   ========================================================================= */

// ---- PROD seams ----------------------------------------------------------
const ELIGIBILITY_HOURS = 1;           // give the field rep first crack
const CLAIM_HOURS = 24;

// Live feed — same endpoint the SalesRep dash uses.
const API_BASE = "https://repsdashboard-azchfecngygafmep.southcentralus-01.azurewebsites.net/api/untouched-leads/";
const API_CODE = "aNdpydlNtfuOpFLB2Ab1oDjrTg6SVJOMfIg5ErWelULJAzFu3ZqX4Q==";
const feedUrl = () => API_BASE + "?code=" + encodeURIComponent(API_CODE);

// Real CRM deep-link (matches SalesRep dash).
const CRM_RECORD_URL = (leadId) =>
  `https://www.mylifesourcewater.com/webcrm/expandedleads.php?leads_id=${leadId}`;

// Lost-sale detection — ported verbatim from the SalesRep dash (LOST_RE + status 6).
const LOST_RE = /\blost\s+sale\b|\bmark(?:ing|ed)?\s+(?:as\s+)?lost\b|\blost\s+to\s+\w+|\bnot\s+closable\b|\bdead\s+lead\b|\blost\s+cause\b|\bclosed\s+lost\b|\bdo[\s-]+not[\s-]+sell\b|\bdon['’]?t\s+sell\b|\bunable\s+to\s+install\b[\s\w-]{0,40}?\bsystem\b/i;
// EM Duggan partner channel — excluded from the pool (SalesRep POOL_EXCLUDE_RE pattern).
// Scans rep name + account name + comments; the "E M" prefix keeps plain "Duggan" surnames safe.
const POOL_EXCLUDE_RE = /\be\.?\s*m\.?\s*duggan\b/i;
const isDuggan = (r) =>
  POOL_EXCLUDE_RE.test(r.salesreps_name || "") ||
  POOL_EXCLUDE_RE.test(r.account_name || "") ||
  POOL_EXCLUDE_RE.test(r.comments || "");

// Aggregator / placeholder records that show up in the customer name: Yelp, brand, corporate.
// Word boundaries keep real names safe (e.g. "Brandon" won't match "brand").
const isJunkName = (r) => /\b(yelp|brand|corporate)\b/i.test(r.account_name || "");

// Free-text signals that a live conversation happened, beyond the structured
// "Dialed Contact: Contacted" marker and the Contact date column. Kept conservative
// so failed attempts ("left message", "no answer", "disconnected") don't match.
const CONTACTED_TEXT_RE = /\b(spoke|talked)\s+(to|with)\b|\b(customer|client|cust|he|she|they)\s+(said|says|mentioned|asked|answered)\b|\b(customer|client|cust)\s+(wants|needs|would\s+like|prefers|is\s+interested|is\s+looking|are\s+looking)\b|\banswered\s+the\s+(phone|call)\b|\bon\s+the\s+phone\s+with\b|\bpicked\s*up\b|\breached\s+(the\s+)?(customer|client|him|her|them)\b/i;

// Reusable contacted check (structured marker, Contact column, or conversation text).
const isContacted = (r) =>
  /Dialed Contact:\s*Contacted/i.test(r.comments || "") ||
  isVal(r.Contact) ||
  CONTACTED_TEXT_RE.test(r.comments || "");

// sLeads are tagged in account_type, e.g. "sLead / Relead". Match the sLead token.
const isSLead = (r) => /\bs[-\s]?lead/i.test(String(r.account_type || ""));
const isCommercial = (_r) => false;    // PROD: commercial field name still unconfirmed in feed

// Drop prospects + already-paid customers (residential leads only). relead handled separately.
const EXCLUDED_ACCOUNT_CLASSES = ["prospect", "customer"];

// Roster from the May 2026 census, keyed by lastname|first-initial so feed nicknames
// (Rich→Richard, Sam→Samuel, Dan→Daniel…) resolve. NST reps have no branch.
function repKey(name) {
  const n = String(name || "").replace(/\s*-\s*National Sales\s*$/i, "").trim().toLowerCase();
  const p = n.split(/\s+/).filter(Boolean);
  return p.length < 2 ? n : `${p[p.length - 1]}|${p[0][0]}`;
}
const ROSTER = {
  "bartow|s": { b: null, t: "NST" }, "bergam|n": { b: "Texas", t: "Field" },
  "brar|g": { b: null, t: "NST" }, "brownell|b": { b: "Arizona", t: "Field" },
  "brown|d": { b: "Fresno", t: "Field" }, "butler|k": { b: "San Clemente", t: "Field" },
  "camba|r": { b: null, t: "NST" }, "chamberlin|c": { b: "Las Vegas", t: "Field" },
  "colosi|n": { b: "Las Vegas", t: "Field" }, "coria|p": { b: "Arizona", t: "Field" },
  "crabb|c": { b: "San Diego", t: "Field" }, "delgado|f": { b: null, t: "NST" },
  "donella|c": { b: "Pasadena", t: "Field" }, "fithian|j": { b: "Pasadena", t: "Field" },
  "foronda|r": { b: null, t: "NST" }, "gaillard|a": { b: "San Jose", t: "Field" },
  "garcia-cano|f": { b: "Inland Empire", t: "Field" }, "gumbinger|s": { b: "Sacramento", t: "Field" },
  "halderman|j": { b: null, t: "NST" }, "hess|c": { b: "Inland Empire", t: "Field" },
  "hillard|d": { b: "Pasadena", t: "Field" }, "hudson|t": { b: null, t: "NST" },
  "jaramillo|l": { b: "San Clemente", t: "Field" }, "karapetian|v": { b: "Pasadena", t: "Field" },
  "kaye|j": { b: "Ventura", t: "Field" }, "kelly|d": { b: "Inland Empire", t: "Field" },
  "kirkendoll|m": { b: "San Clemente", t: "Field" }, "lewis|s": { b: "Ventura", t: "Field" },
  "liechty|e": { b: "San Jose", t: "Field" }, "marcouillier|d": { b: "Arizona", t: "Field" },
  "marcouillier|k": { b: "San Jose", t: "Field" }, "mclean|c": { b: "Central Coast", t: "Field" },
  "mullen|k": { b: "Inland Empire", t: "Field" }, "munoz|g": { b: "San Clemente", t: "Field" },
  "nam|m": { b: null, t: "NST" }, "nelson|m": { b: "San Diego", t: "Field" },
  "nielsen|s": { b: "San Diego", t: "Field" }, "pease|b": { b: "Sacramento", t: "Field" },
  "pickering|j": { b: "Texas", t: "Field" }, "rabelas|n": { b: "San Jose", t: "Field" },
  "rankin|a": { b: "Sacramento", t: "Field" }, "renner|w": { b: "San Jose", t: "Field" },
  "rignack|r": { b: "Pasadena", t: "Field" }, "robinson|s": { b: "San Clemente", t: "Field" },
  "ross|d": { b: "Arizona", t: "Field" }, "ruddell|g": { b: "Pasadena", t: "Field" },
  "sabor|d": { b: "Arizona", t: "Field" }, "sagen|j": { b: "Pasadena", t: "Field" },
  "segovia|b": { b: "San Jose", t: "Field" }, "simonton|r": { b: "San Jose", t: "Field" },
  "soares|c": { b: "Central Coast", t: "Field" }, "sorbello|r": { b: "San Jose", t: "Field" },
  "ton|a": { b: "Inland Empire", t: "Field" }, "travis|d": { b: "Inland Empire", t: "Field" },
  "wafford|m": { b: "Arizona", t: "Field" }, "watts|j": { b: "Texas", t: "Field" },
  "willette|z": { b: "Las Vegas", t: "Field" },
};

// ---- Access control (Entra SSO identity, matched by email) ---------------
// Appointment setters can claim; admins see/manage everything. Keys are lowercase emails.
const ACCESS_MAP = {
  // Appointments team — can claim & appear on the opp
  "alexandra@lifesourcewater.com": { name: "Alexandra Williams", initials: "AW", role: "setter" },
  "fabio@lifesourcewater.com": { name: "Fabio Davila", initials: "FD", role: "setter" },
  "lisa@lifesourcewater.com": { name: "Lisa Porras", initials: "LP", role: "setter" },
  "jsequera@lifesourcewater.com": { name: "Juan Sequera", initials: "JS", role: "setter" },
  "alexi@lifesourcewater.com": { name: "Alexi Martin", initials: "AM", role: "setter" },
  "diego@lifesourcewater.com": { name: "Diego Soc Domingo", initials: "DD", role: "setter" },
  "dcerrato@lifesourcewater.com": { name: "Daniel Cerrato", initials: "DC", role: "setter" },
  "amunoz@lifesourcewater.com": { name: "Angelo Granada", initials: "AG", role: "setter" },
  // Admins — see everything, release/extend any claim
  "georgia@lifesourcewater.com": { name: "Georgia Harris", initials: "GH", role: "admin" },
  "bryan@lifesourcewater.com": { name: "Bryan Harris", initials: "BH", role: "admin" },
  "nora@lifesourcewater.com": { name: "Nora Avanesian", initials: "NA", role: "admin" },
  "mark@lifesourcewater.com": { name: "Mark Harris", initials: "MH", role: "admin" },
};

// SSO identity resolution — ported from the SalesRep dash (handles B2B guest UPNs).
async function fetchUserIdentity() {
  try {
    const resp = await fetch("/.auth/me");
    if (!resp.ok) return null;
    const payload = await resp.json();
    const cp = payload && payload.clientPrincipal;
    return cp ? identityEmailFromPrincipal(cp) : null;
  } catch {
    return null; // /.auth/me absent (e.g. local preview) → caller falls back to dev picker
  }
}
function identityEmailFromPrincipal(cp) {
  const looksEmail = (s) => typeof s === "string" && !s.includes("#") && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);
  const deExt = (s) => {
    if (typeof s !== "string") return s;
    const m = s.match(/^(.+)#EXT#@/i);
    return m ? m[1].replace(/_([^_]+)$/, "@$1") : s;
  };
  const candidates = [];
  if (cp.userDetails) { candidates.push(cp.userDetails); candidates.push(deExt(cp.userDetails)); }
  (Array.isArray(cp.claims) ? cp.claims : []).forEach((c) => {
    const typ = String(c.typ || c.type || "").toLowerCase();
    const val = c.val || c.value;
    if (val && (typ.includes("email") || typ.includes("preferred_username") || typ.endsWith("/upn") || typ === "upn")) {
      candidates.push(val); candidates.push(deExt(val));
    }
  });
  return candidates.find(looksEmail) || (cp.userDetails || null);
}

// ---- Seed: faithful transcription of the pasted sample -------------------
const SEED = [
  { lead_date_in: "2025-11-01", leads_id: 739066, status_id: 0, status: "Unknown", salesreps_name: "Richard Foronda", account_name: "Steve Schwind", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-01 09:32:20", "Email Sent": null, "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-01 09:32:20 , Richard Foronda : Dialed Contact: Left Message\n2025-11-01 09:32:31 , Richard Foronda : CDR note: Milestone: Text sent" },
  { lead_date_in: "2025-11-01", leads_id: 739069, status_id: 0, status: "Unknown", salesreps_name: "Travis Hudson - National Sales", account_name: "Delane Crawford", professional: "false", water_type: "Municipal", Contact: "2025-11-05 12:45:04", Dialed: "2025-11-03 13:44:09", "Email Sent": "2025-11-03 07:01:14", "Quote Sent": "2025-11-05 12:51:56", "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: 3975.0, comments: "2025-11-01 08:16:20 , Travis Hudson - National Sales : Dialed Contact: Dialed\n2025-11-03 07:01:14 , Travis Hudson - National Sales : Emailed Contact: Subject-LifeSource System vs a Water Softener\n2025-11-03 13:44:09 , Travis Hudson - National Sales : Dialed Contact: Dialed\n2025-11-04 13:35:48 , Travis Hudson - National Sales : Dialed Contact: Dialed\n2025-11-04 13:48:52 , Travis Hudson - National Sales : CNALM\n2025-11-05 12:45:04 , Travis Hudson - National Sales : Dialed Contact: Contacted\n2025-11-05 12:49:32 , Travis Hudson - National Sales : 3997.00+300\n2025-11-11 14:35:49 , Travis Hudson - National Sales : Called to follow up on quote\n2025-11-11 14:35:49 , Travis Hudson - National Sales : Dialed Contact: Dialed" },
  { lead_date_in: "2025-11-01", leads_id: 739071, status_id: 4, status: "Warm", salesreps_name: "Diego Soc Domingo", account_name: "Jenivee Yelp", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-03 07:24:11", "Email Sent": null, "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-03 07:24:11 , Diego Soc Domingo : yelp - Fountain Valley, CA 92708\n2025-11-03 07:24:11 , Diego Soc Domingo : Dialed Contact: Left Message\n2025-11-03 07:24:44 , Diego Soc Domingo : I texted client, waiting for her response\n2025-11-06 10:09:52 , Nora Avanesian : Teamwork Activated (1489)" },
  { lead_date_in: "2025-11-01", leads_id: 739072, status_id: 4, status: "Warm", salesreps_name: "Diego Soc Domingo", account_name: "Clifford J. Yelp", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-03 07:26:10", "Email Sent": null, "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-03 07:26:10 , Diego Soc Domingo : Yelp - Phoenix, AZ 85027\n2025-11-03 07:26:10 , Diego Soc Domingo : Dialed Contact: Left Message\n2025-11-03 07:26:57 , Diego Soc Domingo : I texted client, waiting for response\n2025-11-06 10:09:52 , Nora Avanesian : Teamwork Activated (1489)" },
  { lead_date_in: "2025-11-01", leads_id: 739074, status_id: 0, status: "Unknown", salesreps_name: "Dale Marcouillier", account_name: "Kathy Kurgan", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-01 08:29:15", "Email Sent": "2025-11-18 08:27:57", "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-01 08:29:15 , Pablo Coria : Called client she said she would call me back in a little bit.\n2025-11-01 08:29:15 , Pablo Coria : Dialed Contact: Dialed\n2025-11-02 12:13:00 , Pablo Coria : called and l/m\n2025-11-02 12:13:00 , Pablo Coria : Dialed Contact: Left Message\n2025-11-03 11:57:32 , Pablo Coria : l/m sending a text\n2025-11-03 11:57:32 , Pablo Coria : Dialed Contact: Left Message\n2025-11-05 10:26:55 , Pablo Coria : called left msg and sent text.\n2025-11-05 10:26:55 , Pablo Coria : Dialed Contact: Left Message\n2025-11-10 15:17:43 , Dale Marcouillier : Emailed Contact: Subject-LifeSource Water - Your Request For Information\n2025-11-10 15:18:01 , Dale Marcouillier : Sent email to call me.\n2025-11-10 15:18:01 , Dale Marcouillier : Dialed Contact: Dialed\n2025-11-18 08:26:30 , Daniel Cerrato : No answer vm&txt\n2025-11-18 08:26:30 , Daniel Cerrato : Dialed Contact: Dialed\n2025-11-18 08:27:58 , Daniel Cerrato : Emailed Contact: Subject-Tried calling you about your water system request" },
  { lead_date_in: "2025-11-01", leads_id: 739075, status_id: 5, status: "Cold", salesreps_name: "Diego Soc Domingo", account_name: "Amy Yelp", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-03 07:40:23", "Email Sent": null, "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-03 07:40:23 , Diego Soc Domingo : I called her and she said he had taken care of, no needed help\n2025-11-03 07:40:23 , Diego Soc Domingo : Dialed Contact: Dialed\n2025-11-06 10:09:52 , Nora Avanesian : Teamwork Activated (1489)" },
  { lead_date_in: "2025-11-01", leads_id: 739076, status_id: 2, status: "Unknown", salesreps_name: "Chad Jones", account_name: "David SILVER", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-01 08:19:44", "Email Sent": "2025-11-10 17:02:52", "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-01 08:19:44 , Chad Jones : Texted\n2025-11-01 08:19:44 , Chad Jones : Dialed Contact: Left Message\n2025-11-06 10:13:30 , Nora Avanesian : Teamwork Activated (1404)\n2025-11-06 12:27:16 , Richard Foronda : Dialed Contact: Dialed\n2025-11-10 17:02:52 , Chad Jones : Emailed Contact: Subject-Thank you for your inquiry into LifeSource Water!\n2025-11-18 08:59:48 , Daniel Cerrato : No answer vm,txt&email\n2025-11-25 12:33:03 , Chad Jones : Dialed Contact: Left Message\n2026-02-08 10:22:23 , Chad Jones : Emailed Contact: Subject-Thank you for your inquiry into LifeSource Water!\n2026-04-14 10:27:25 , Chad Jones : Emailed Contact: Subject-Still interested in a quote for clean water?" },
  { lead_date_in: "2025-11-01", leads_id: 739077, status_id: 4, status: "Warm", salesreps_name: "Rich Simonton", account_name: "Andrew Qu", professional: "false", water_type: "Municipal", Contact: null, Dialed: "2025-11-01 08:34:27", "Email Sent": "2025-11-01 17:37:58", "Quote Sent": null, "Set Appt": null, "Appt. Completed": null, "CDR Appt. Done": null, quote_amount: null, comments: "2025-11-01 08:34:27 , Rich Simonton : Called and text1 sent\n2025-11-01 08:34:27 , Rich Simonton : Dialed Contact: Dialed\n2025-11-01 17:37:19 , Rich Simonton : Called couldn't leave VM... VM was full. Send email also call and send text 2 in the morning" },
];

// ---- Parsing engine ------------------------------------------------------
const isVal = (v) => v !== null && v !== undefined && v !== "" && !(typeof v === "number" && isNaN(v));
const TS_RE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\s*,\s*(.+?)\s*:\s*([\s\S]*)$/;

function parseComments(str) {
  if (!isVal(str)) return { lines: [], touches: 0, contacted: false, lastLine: null, lastTs: null, firstTs: null };
  const raw = String(str).split("\n").map((s) => s.trim()).filter(Boolean);
  const lines = raw.map((l) => {
    const m = l.match(TS_RE);
    if (m) return { ts: m[1], who: m[2], text: m[3], raw: l };
    return { ts: null, who: null, text: l, raw: l };
  });
  const touches = lines.filter((l) => /Dialed Contact:|Emailed Contact:/i.test(l.text)).length;
  const contacted = lines.some((l) => /Dialed Contact:\s*Contacted/i.test(l.text));
  const attemptLines = lines.filter((l) => l.who && /Dialed Contact:|Emailed Contact:/i.test(l.text));
  const lastAttempt = attemptLines.length ? attemptLines[attemptLines.length - 1] : null;
  const tsList = lines.map((l) => l.ts).filter(Boolean).sort();
  return {
    lines,
    touches,
    contacted,
    lastAttemptBy: lastAttempt ? lastAttempt.who : null,
    lastAttemptTs: lastAttempt ? lastAttempt.ts : null,
    lastLine: lines[lines.length - 1] || null,
    lastTs: tsList.length ? tsList[tsList.length - 1] : null,
    firstTs: tsList.length ? tsList[0] : null,
  };
}

function deriveMilestone(r) {
  if (isVal(r["Appt. Completed"])) return "Appt completed";
  if (isVal(r["Set Appt"])) return "Appt set";
  if (isVal(r["Quote Sent"])) return "Quote sent";
  if (isVal(r.Contact)) return "Contacted";
  if (isVal(r["Email Sent"])) return "Emailed";
  if (isVal(r.Dialed)) return "Dialed";
  return "New";
}
// Appointment set = a date in any of these three CRM fields, regardless of who set it.
const hasApptSet = (r) =>
  isVal(r["Set Appt"]) || isVal(r["Appt. Completed"]) || isVal(r["CDR Appt. Done"]);
// Quoted / letter-sent but no appointment — still hidden from the board (further along, no appt).
const quotedNoAppt = (r) =>
  !hasApptSet(r) && (isVal(r["Quote Sent"]) || isVal(r["Letter Sent"]));
// Who set the appointment — inferred from an appointment-setting comment's author.
const APPT_SET_RE = /\bset\s+appt|\bset\s+appointment|\bappointment\s+set|\bappt\.?\s+set|\bbooked\s+(the\s+|an\s+)?appt|\bset\s+(an\s+|the\s+)?appointment/i;
const apptSetByAuthor = (rec, personName) => {
  const key = repKey(personName);
  return parseComments(rec.comments).lines.some((l) => l.who && repKey(l.who) === key && APPT_SET_RE.test(l.text || ""));
};
const isLost = (r) =>
  r.status_id === 6 || /lost\s*sale/i.test(r.status || "") || LOST_RE.test(r.comments || "");
const isResidential = (r) => String(r.professional).toLowerCase() !== "true" && !isCommercial(r);

function enrich(r, now) {
  const p = parseComments(r.comments);
  const repName = (r.salesreps_name || "").replace(/\s*-\s*National Sales\s*$/i, "").trim();
  const firstMs = p.firstTs ? Date.parse(p.firstTs.replace(" ", "T")) : Date.parse(r.lead_date_in + "T00:00:00");
  // Exact lead-in timestamp now available; fall back to first comment if missing.
  const leadInMs = isVal(r.lead_created_time)
    ? Date.parse(String(r.lead_created_time).replace(" ", "T"))
    : firstMs;
  const stageTouches = [r.Dialed, r["Email Sent"], r.Contact].filter(isVal).length;
  const commentEntries = p.lines.filter((l) => l.ts).length;
  const touches = Math.max(commentEntries, stageTouches);
  const lastTouchMs = (() => {
    const ds = [r.Dialed, r["Email Sent"], r.Contact, p.lastTs]
      .filter(isVal).map((d) => Date.parse(String(d).replace(" ", "T"))).filter((n) => !isNaN(n));
    return ds.length ? Math.max(...ds) : null;
  })();
  // Three buckets: appointment made → contact attempted → no contact attempted.
  let category = "noattempt";
  if (hasApptSet(r)) category = "apptmade";
  else if (touches > 0) category = "attempted";
  // Roster lookup drives team + branch (name suffix alone is unreliable; see Richard Foronda).
  const ro = ROSTER[repKey(r.salesreps_name)];
  const teamVal = ro ? ro.t : (/national sales/i.test(r.salesreps_name || "") ? "NST" : "Field");
  const branch = teamVal === "NST" ? "National" : (ro ? ro.b : "—");
  const ageBucket = now - leadInMs < ELIGIBILITY_HOURS * 3.6e6 ? "fresh" : "aged";
  return {
    ...r,
    repName,
    branch,
    team: teamVal,
    milestone: deriveMilestone(r),
    touches: touches,
    lastAttemptBy: p.lastAttemptBy,
    lastAttemptTs: p.lastAttemptTs,
    lines: p.lines,
    lastLine: p.lastLine,
    lastTouchMs,
    firstMs,
    leadInMs,
    ageBucket,
    searchBlob: `${r.account_name || ""} ${repName} ${r.leads_id} ${r.comments || ""}`.toLowerCase(),
    hoursSinceTouch: lastTouchMs ? (now - lastTouchMs) / 3.6e6 : null,
    category,
  };
}

function fmtDur(ms) {
  if (ms == null) return "—";
  const m = Math.floor(ms / 6e4);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
const fmtClock = (ms) => {
  const t = Math.max(0, ms);
  const h = Math.floor(t / 3.6e6);
  const m = Math.floor((t % 3.6e6) / 6e4);
  return `${h}h ${String(m).padStart(2, "0")}m`;
};

const TABS = [
  { id: "noattempt", label: "No contact attempted",
    desc: "No outreach has been logged yet — no dials, emails, texts, or comments. Fresh; you're the first attempt." },
  { id: "attempted", label: "Contact attempted",
    desc: "Outreach has been attempted (dialed, emailed, texted, or a note logged) but no appointment is set yet. The active working pile." },
  { id: "apptmade", label: "Appointment made",
    desc: "An appointment is set on this lead — a date in Set Appt, Appt Completed, or CDR Appt Done." },
  { id: "mine", label: "My queue",
    desc: "Leads you've claimed. They stay yours until you release them, so no one else works them in the meantime." },
];

const POOL_NOTE = "This board shows residential leads the assigned field rep didn't reach within the first hour. Already excluded: quoted/letter-sent leads with no appointment, lost sales, sLeads, releads, prospects, existing customers, EM Duggan, and Yelp/brand/corporate placeholder records.";

function FieldDiag({ records }) {
  const [open, setOpen] = useState(false);
  const fields = ["account_type", "account_class", "relead", "water_type", "status"];
  const summary = useMemo(() => {
    return fields.map((f) => {
      const counts = {};
      (records || []).forEach((r) => {
        const v = r[f] === null || r[f] === undefined || r[f] === "" ? "(blank)" : String(r[f]);
        counts[v] = (counts[v] || 0) + 1;
      });
      const vals = Object.entries(counts).sort((a, b) => b[1] - a[1]);
      return { f, vals };
    });
  }, [records]);
  return (
    <div className="asb-diag">
      <button className="asb-diag-toggle" onClick={() => setOpen((o) => !o)}>
        <Shield size={13} /> Admin · field values {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="asb-diag-grid">
          {summary.map(({ f, vals }) => (
            <div className="asb-diag-col" key={f}>
              <div className="asb-diag-field">{f}</div>
              {vals.map(([v, n]) => (
                <div className="asb-diag-row" key={v}><span>{v}</span><b>{n}</b></div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AppointmentSetterBoard() {
  const [now, setNow] = useState(Date.now());
  const [me, setMe] = useState(null); // {email, name, initials, role}
  const [access, setAccess] = useState("resolving"); // resolving | ok | blocked | devpick
  const [signedEmail, setSignedEmail] = useState("");
  const [claims, setClaims] = useState({}); // shared claim store (via /api/claims)
  const [apiOn, setApiOn] = useState(null); // null unknown | true (API live) | false (local fallback)
  const [tab, setTab] = useState("noattempt");
  const [q, setQ] = useState("");
  const [teamF, setTeamF] = useState("all");
  const [branchF, setBranchF] = useState("all");
  const [repExcluded, setRepExcluded] = useState(() => new Set()); // empty = all reps shown
  const [touchWin, setTouchWin] = useState("any");
  const [leadWin, setLeadWin] = useState("any");
  const [assignWin, setAssignWin] = useState("any"); // admin: claim-date window
  const [sortKey, setSortKey] = useState("leadin"); // leadin | touches | since
  const [sortDir, setSortDir] = useState("desc");
  const [claimedByF, setClaimedByF] = useState("all"); // admin: filter by who claimed
  const [ageSeg, setAgeSeg] = useState("aged"); // aged (>1h) | fresh (<1h)
  const [sel, setSel] = useState(() => new Set()); // admin multi-select
  const [assignTo, setAssignTo] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [drill, setDrill] = useState(null); // {by, metric} — Setter Queues drill-down
  const [page, setPage] = useState(0);
  const [hover, setHover] = useState(null); // {rec, x, y}
  const [records, setRecords] = useState(null); // raw feed (null=loading)
  const [loadState, setLoadState] = useState("loading"); // loading | ready | error
  const [loadErr, setLoadErr] = useState("");
  const PAGE = 12;

  // Resolve who is signed in (Entra SSO). Roster → setter/admin; any other
  // LifeSource email → view-only; non-LifeSource → blocked. No SSO (preview) → dev picker.
  useEffect(() => {
    (async () => {
      const email = await fetchUserIdentity();
      if (!email) { setAccess("devpick"); return; } // local/preview, no /.auth/me
      const lc = email.toLowerCase();
      setSignedEmail(lc);
      const entry = ACCESS_MAP[lc];
      if (entry) { setMe({ email: lc, ...entry }); setAccess("ok"); }
      else if (lc.endsWith("@lifesourcewater.com")) {
        const local = lc.split("@")[0];
        setMe({ email: lc, name: local, initials: local.slice(0, 2).toUpperCase(), role: "viewer" });
        setAccess("ok");
      } else setAccess("blocked");
    })();
  }, []);
  const isAdmin = me?.role === "admin";

  // Live data load — mirrors the SalesRep dash: client-side fetch, NaN-tolerant
  // parse, dedup by leads_id. Set USE_LIVE=false to fall back to embedded SEED.
  const USE_LIVE = true;
  async function loadLiveData() {
    if (!USE_LIVE) { setRecords(SEED); setLoadState("ready"); return; }
    setLoadState("loading"); setLoadErr("");
    try {
      const resp = await fetch(feedUrl(), { method: "GET" });
      if (!resp.ok) throw new Error(`CRM feed returned HTTP ${resp.status}.`);
      const text = await resp.text();
      // Python json can emit NaN/Infinity (invalid JSON) — sanitize before parse.
      const clean = text.replace(/\bNaN\b/g, "null").replace(/-?\bInfinity\b/g, "null");
      const parsed = JSON.parse(clean);
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed?.data || parsed?.records || parsed?.results || [];
      // Dedup by leads_id, keeping the richest (longest comments) copy.
      const byId = new Map();
      for (const r of arr) {
        const ex = byId.get(r.leads_id);
        if (!ex || (r.comments || "").length > (ex.comments || "").length) byId.set(r.leads_id, r);
      }
      setRecords([...byId.values()]);
      setLoadState("ready");
    } catch (e) {
      setLoadErr(String(e.message || e));
      setLoadState("error");
    }
  }
  useEffect(() => { if (access === "ok" || access === "devpick") loadLiveData(); }, [access]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // ---- Shared claim store (Azure Function + Table Storage at /api/claims) ----
  // Falls back to in-session state when the API isn't present (preview / local dev).
  const CLAIMS_API = "/api/claims";
  const loadClaims = async () => {
    try {
      const r = await fetch(CLAIMS_API, { headers: { "cache-control": "no-cache" } });
      if (!r.ok) throw new Error("no api");
      const data = await r.json();
      setClaims(data || {});
      setApiOn(true);
    } catch {
      setApiOn((v) => (v === true ? true : false)); // stay in local mode
    }
  };
  useEffect(() => { loadClaims(); }, []);
  useEffect(() => {
    if (apiOn !== true) return;
    const t = setInterval(loadClaims, 20000); // near-real-time cross-user sync
    return () => clearInterval(t);
  }, [apiOn]);

  const claimOf = (id) => claims[id] || null; // claims persist until released
  const canClaim = me && (me.role === "setter" || me.role === "admin");
  const claimFor = (user) => ({ by: user.email, byName: user.name, initials: user.initials, at: Date.now() });

  const doClaim = async (id) => {
    if (!canClaim) return;
    const claim = claimFor(me);
    setClaims((p) => ({ ...p, [id]: claim })); // optimistic
    if (apiOn) {
      try {
        const r = await fetch(CLAIMS_API, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ leadId: id, ...claim, force: false }),
        });
        const data = await r.json();
        if (data?.claims) setClaims((p) => ({ ...p, ...data.claims })); // reflects a conflicting owner
      } catch { /* keep optimistic */ }
    }
  };
  const doRelease = async (id) => {
    setClaims((p) => { const n = { ...p }; delete n[id]; return n; });
    if (apiOn) { try { await fetch(`${CLAIMS_API}/${id}`, { method: "DELETE" }); } catch {} }
  };
  const assignMany = async (ids, user) => {
    const c = claimFor(user);
    setClaims((p) => { const n = { ...p }; ids.forEach((id) => { n[id] = c; }); return n; });
    if (apiOn) {
      try {
        await fetch(CLAIMS_API, {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ assignments: ids.map((id) => ({ leadId: id, ...c })), force: true }),
        });
        loadClaims();
      } catch {}
    }
  };

  // enrich + eligibility filter
  const eligible = useMemo(() => {
    return (records || []).map((r) => enrich(r, now)).filter((r) => {
      if (!isResidential(r)) return false;        // residential only
      if (isSLead(r)) return false;               // drop sLeads
      if (String(r.relead || "").trim().toLowerCase() === "y") return false; // drop releads
      if (isLost(r)) return false;                // drop lost
      if (quotedNoAppt(r)) return false;          // quoted/letter but no appt — still hidden
      if (isDuggan(r)) return false;              // drop EM Duggan partner channel
      if (isJunkName(r)) return false;            // drop Yelp / brand / corporate placeholder records
      if (EXCLUDED_ACCOUNT_CLASSES.includes(String(r.account_class || "").trim().toLowerCase())) return false; // drop prospects/customers
      return true;                                // fresh (<1h) kept; segmented in the UI
    });
  }, [records, now]);

  const branches = useMemo(
    () => Array.from(new Set(eligible.map((r) => r.branch))).filter((b) => b !== "—").sort(),
    [eligible]
  );
  const reps = useMemo(
    () => Array.from(new Set(eligible.map((r) => r.repName).filter(Boolean))).sort(),
    [eligible]
  );

  // Time-window filter: "older than" thresholds — surfaces leads going stale.
  // null age never matches a bounded window.
  const inWindow = (hrs, win) => {
    if (win === "any") return true;
    if (hrs == null) return false;
    if (win === "24h") return hrs > 24;
    if (win === "3d") return hrs > 72;
    if (win === "7d") return hrs > 168;
    if (win === "14d") return hrs > 336;
    if (win === "30d") return hrs > 720;
    return true;
  };
  const WIN_OPTS = [
    ["any", "Any time"],
    ["24h", "> 24 hrs"],
    ["3d", "> 3 days"],
    ["7d", "> 7 days"],
    ["14d", "> 14 days"],
    ["30d", "> 30 days"],
  ];
  // Lead-in supports both directions (fresh "within" and stale "older than").
  const inLeadWindow = (hrs, win) => {
    if (win === "any") return true;
    if (hrs == null) return false;
    const m = { w24h: ["<", 24], w3d: ["<", 72], w7d: ["<", 168], w14d: ["<", 336], o7d: [">", 168], o30d: [">", 720] }[win];
    return m ? (m[0] === "<" ? hrs <= m[1] : hrs > m[1]) : true;
  };
  const LEAD_WIN_OPTS = [
    ["any", "Any time"],
    ["w24h", "Within 24 hrs"],
    ["w3d", "Within 3 days"],
    ["w7d", "Within 7 days"],
    ["w14d", "Within 14 days"],
    ["o7d", "Older than 7 days"],
    ["o30d", "Older than 30 days"],
  ];
  const ASSIGN_WIN_OPTS = [
    ["any", "Any time"],
    ["24h", "Last 24 hrs"],
    ["7d", "Last 7 days"],
    ["30d", "Last 30 days"],
    ["90d", "Last 90 days"],
  ];
  // Assignment-date window (by claim.at) — lets admins scope stats to a period.
  const inAssignWin = (atMs) => {
    if (assignWin === "any") return true;
    if (!atMs) return false;
    const days = { "24h": 1, "7d": 7, "30d": 30, "90d": 90 }[assignWin];
    return (now - atMs) <= days * 24 * 3.6e6;
  };

  // All row-level filters EXCEPT the age segment and the category tab. Counts derive
  // from this so the tab totals (and age-segment totals) reflect the active filters.
  const baseFiltered = useMemo(() => {
    const qlc = q.trim().toLowerCase();
    return eligible.filter((r) => {
      if (teamF !== "all" && r.team !== teamF) return false;
      if (branchF !== "all" && r.branch !== branchF) return false;
      if (repExcluded.has(r.repName)) return false;
      if (!inWindow(r.hoursSinceTouch, touchWin)) return false;
      if (!inLeadWindow((now - r.leadInMs) / 3.6e6, leadWin)) return false;
      if (qlc && !r.searchBlob.includes(qlc)) return false;
      if (claimedByF !== "all") {
        const c = claims[r.leads_id];
        if (claimedByF === "unclaimed" ? !!c : c?.by !== claimedByF) return false;
      }
      if (assignWin !== "any") { const c = claims[r.leads_id]; if (c && !inAssignWin(c.at)) return false; }
      return true;
    });
  }, [eligible, teamF, branchF, repExcluded, touchWin, leadWin, q, now, claimedByF, claims, assignWin]);

  const ageTotals = useMemo(() => {
    const t = { fresh: 0, aged: 0 };
    baseFiltered.forEach((r) => { t[r.ageBucket]++; });
    return t;
  }, [baseFiltered]);
  const segFiltered = useMemo(() => baseFiltered.filter((r) => r.ageBucket === ageSeg), [baseFiltered, ageSeg]);

  const counts = useMemo(() => {
    const c = { noattempt: 0, attempted: 0, apptmade: 0, mine: 0 };
    segFiltered.forEach((r) => { c[r.category]++; if (claimOf(r.leads_id)?.by === me?.email) c.mine++; });
    return c;
  }, [segFiltered, claims, now, me?.email]);

  // Admin setter-queue analytics. Computed from the RAW feed (not `eligible`) joined
  // to claims, so opps that had an appointment set — which leave the working board —
  // are still counted. "Setter touch" = a comment authored by the assigned setter.
  const recById = useMemo(() => {
    const m = new Map();
    (records || []).forEach((r) => m.set(String(r.leads_id), r));
    return m;
  }, [records]);

  const setterTouched = (rec, setterName) => {
    const key = repKey(setterName);
    return parseComments(rec.comments).lines.some((l) => l.who && repKey(l.who) === key);
  };

  const setterQueues = useMemo(() => {
    const map = new Map();
    Object.entries(claims).forEach(([leadId, c]) => {
      if (!inAssignWin(c.at)) return; // scope to assignment-date window
      const rec = recById.get(String(leadId));
      const e = map.get(c.by) || { name: c.byName, initials: c.initials, total: 0, noTouch: 0, apptBySetter: 0, apptByField: 0 };
      e.total++;
      if (rec) {
        if (!setterTouched(rec, c.byName)) e.noTouch++;
        if (hasApptSet(rec)) {
          if (apptSetByAuthor(rec, c.byName)) e.apptBySetter++;
          else e.apptByField++;
        }
      }
      map.set(c.by, e);
    });
    return [...map.entries()].map(([email, v]) => ({ email, ...v })).sort((a, b) => b.total - a.total);
  }, [claims, recById, assignWin, now]);
  const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0) + "%";

  // When one setter is selected, reconcile their Assigned total to what's on the board.
  const selSetter = (claimedByF !== "all" && claimedByF !== "unclaimed") ? claimedByF : null;
  const recon = useMemo(() => {
    if (!selSetter) return null;
    const ids = Object.entries(claims)
      .filter(([, c]) => c.by === selSetter && inAssignWin(c.at)).map(([id]) => String(id));
    const byId = new Map(eligible.map((r) => [String(r.leads_id), r]));
    const cat = { noattempt: 0, attempted: 0, apptmade: 0 };
    let open = 0;
    ids.forEach((id) => { const er = byId.get(id); if (er) { open++; cat[er.category]++; } });
    const total = ids.length;
    const name = setterQueues.find((s) => s.email === selSetter)?.name || selSetter;
    return { name, total, open, cat, other: Math.max(0, total - open) };
  }, [selSetter, claims, eligible, setterQueues, assignWin, now]);

  const rows = useMemo(() => {
    let list = segFiltered.filter((r) => {
      if (tab === "mine") return claimOf(r.leads_id)?.by === me?.email;
      return r.category === tab;
    });
    // Click-to-sort columns. Nulls always sink to the bottom regardless of direction.
    const val = {
      touches: (r) => r.touches,
      since: (r) => r.hoursSinceTouch,
      leadin: (r) => r.leadInMs,
    }[sortKey];
    const dir = sortDir === "desc" ? 1 : -1;
    const cmp = (a, b) => {
      const av = val(a), bv = val(b);
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (bv - av) * dir;
    };
    return [...list].sort(cmp);
  }, [segFiltered, tab, sortKey, sortDir, claims, now, me?.email]);

  const toggleSort = (key) => {
    if (key === sortKey) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortKey(key); setSortDir("desc"); }
  };
  const sortArrow = (key) => (key === sortKey ? (sortDir === "desc" ? " ↓" : " ↑") : "");

  // Drill-down: click a Setter Queues metric to see exactly those leads (across categories,
  // including opps that dropped off the normal board view). Built from raw records + claims.
  const METRIC_LABEL = { assigned: "assigned", notouch: "no setter touch", apptsetter: "appt by setter", apptfield: "appt by field rep" };
  const drillRows = useMemo(() => {
    if (!drill) return null;
    const out = [];
    Object.entries(claims).forEach(([leadId, c]) => {
      if (c.by !== drill.by || !inAssignWin(c.at)) return;
      const rec = recById.get(String(leadId));
      if (!rec) return;
      let keep = true;
      if (drill.metric === "notouch") keep = !setterTouched(rec, c.byName);
      else if (drill.metric === "apptsetter") keep = hasApptSet(rec) && apptSetByAuthor(rec, c.byName);
      else if (drill.metric === "apptfield") keep = hasApptSet(rec) && !apptSetByAuthor(rec, c.byName);
      if (keep) out.push(enrich(rec, now));
    });
    return out.sort((a, b) => (b.leadInMs || 0) - (a.leadInMs || 0));
  }, [drill, claims, recById, now, assignWin]);
  const drillName = drill ? (setterQueues.find((s) => s.email === drill.by)?.name || drill.by) : "";

  const displayRows = drill ? drillRows : rows;

  useEffect(() => setPage(0), [tab, teamF, branchF, repExcluded, touchWin, leadWin, assignWin, q, sortKey, sortDir, ageSeg, claimedByF, drill]);
  useEffect(() => setSel(new Set()), [tab, teamF, branchF, repExcluded, touchWin, leadWin, assignWin, q, sortKey, sortDir, ageSeg, claimedByF, drill, page]);
  const pages = Math.max(1, Math.ceil(displayRows.length / PAGE));
  const pageRows = showAll ? displayRows : displayRows.slice(page * PAGE, page * PAGE + PAGE);
  const toggleSel = (id) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const exportCSV = () => {
    const catLabel = { noattempt: "No contact attempted", attempted: "Contact attempted", apptmade: "Appointment made" };
    const cols = [
      ["Lead ID", (r) => r.leads_id],
      ["Customer", (r) => r.account_name],
      ["Rep", (r) => r.repName],
      ["Team", (r) => r.team],
      ["Branch", (r) => r.branch],
      ["Milestone", (r) => r.milestone],
      ["Touches", (r) => r.touches],
      ["Time since last touch", (r) => fmtDur(r.hoursSinceTouch != null ? now - r.lastTouchMs : null)],
      ["Lead in", (r) => r.lead_date_in],
      ["Category", (r) => catLabel[r.category] || r.category],
      ["Claimed by", (r) => claimOf(r.leads_id)?.byName || ""],
      ["Last comment", (r) => r.lastLine?.text || ""],
    ];
    const esc = (v) => `"${String(v ?? "").replace(/\r?\n/g, " ").replace(/"/g, '""')}"`;
    const csv = [cols.map((c) => esc(c[0])).join(",")]
      .concat(displayRows.map((r) => cols.map((c) => esc(c[1](r))).join(",")))
      .join("\r\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `appointment-board-${tab}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  };

  if (access === "resolving") {
    return (
      <div className="asb"><style>{CSS}</style>
        <div className="asb-status"><span className="asb-spin" /><p>Checking your access…</p></div>
      </div>
    );
  }
  if (access === "blocked") {
    return (
      <div className="asb"><style>{CSS}</style>
        <div className="asb-status asb-status-err" style={{ textAlign: "center" }}>
          <p className="asb-err-title">LifeSource sign-in required</p>
          <p className="asb-err-hint">
            You're signed in as <b>{signedEmail}</b>. This board is available to LifeSource
            employees — please sign in with your @lifesourcewater.com account. Questions? georgia@lifesourcewater.com.
          </p>
          <a className="asb-claim" href="/.auth/logout" style={{ textDecoration: "none" }}>Sign out</a>
        </div>
      </div>
    );
  }

  return (
    <div className="asb">
      <style>{CSS}</style>

      {/* Header */}
      <header className="asb-head">
        <div className="asb-brand">
          <span className="asb-gem" aria-label="White Stone">
            <svg viewBox="0 0 32 32" width="30" height="30" xmlns="http://www.w3.org/2000/svg">
              <defs>
                <linearGradient id="asbGemFace" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#ffffff" />
                  <stop offset="1" stopColor="#dfe6ef" />
                </linearGradient>
              </defs>
              <polygon points="16,2 27,12 16,30 5,12" fill="url(#asbGemFace)" stroke="#9fb2c6" strokeWidth="1" strokeLinejoin="round" />
              <polygon points="5,12 27,12 16,30" fill="#eef2f7" opacity="0.9" />
              <polygon points="16,2 21.5,12 16,30 10.5,12" fill="#ffffff" opacity="0.75" />
              <path d="M5,12 L11,12 L16,2 Z" fill="#ffffff" opacity="0.95" />
              <path d="M16,2 L27,12 M5,12 L27,12 M10.5,12 L16,30 M21.5,12 L16,30" stroke="#b9c6d6" strokeWidth="0.6" fill="none" />
            </svg>
          </span>
          <div>
            <h1>Appointment Setter Board</h1>
            <p>Residential leads the field rep didn't reach in time — claim, dial, set the appointment.</p>
          </div>
        </div>
        <div className="asb-head-right">
          <button className="asb-ghost" onClick={loadLiveData} title="Re-pull from the live CRM feed">
            <RefreshCw size={14} /> Refresh
          </button>
          {access === "devpick" ? (
            <div className="asb-user" title="Preview only — production uses your Entra sign-in">
              <User size={14} />
              <select
                value={me?.email || ""}
                onChange={(e) => { const em = e.target.value; setMe(em ? { email: em, ...ACCESS_MAP[em] } : null); }}
              >
                <option value="">Sign in as…</option>
                {Object.entries(ACCESS_MAP).map(([em, u]) => (
                  <option key={em} value={em}>{u.name}{u.role === "admin" ? " · admin" : ""}</option>
                ))}
              </select>
            </div>
          ) : (
            <div className="asb-signed">
              {isAdmin ? <Shield size={13} /> : <User size={13} />}
              <span>{me?.name}</span>
              <span className="asb-role">{me?.role}</span>
            </div>
          )}
          {apiOn === false && (
            <span className="asb-sync local" title="Claims are local to this browser — the shared store isn't reachable">● local</span>
          )}
          {apiOn === true && (
            <span className="asb-sync live" title="Claims are shared across the team in real time">● synced</span>
          )}
        </div>
      </header>

      {loadState === "loading" && (
        <div className="asb-status">
          <span className="asb-spin" />
          <p>Pulling live leads from the CRM…</p>
        </div>
      )}

      {loadState === "error" && (
        <div className="asb-status asb-status-err">
          <p className="asb-err-title">Couldn't load the live feed</p>
          <p className="asb-err-detail">{loadErr}</p>
          <p className="asb-err-hint">
            If this says "Failed to fetch," the CRM feed is likely blocking this app's
            address. Add this site's URL to the feed's CORS allowed origins, then retry.
          </p>
          <button className="asb-claim" onClick={loadLiveData}><RefreshCw size={13} /> Retry</button>
        </div>
      )}

      {loadState === "ready" && (
      <>
      {/* Controls */}
      <div className="asb-controls">
        <div className="asb-search">
          <Search size={14} />
          <input placeholder="Search name, rep, lead ID, or comments" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Seg label="Team" value={teamF} onChange={setTeamF} opts={[["all", "All"], ["Field", "Field"], ["NST", "NST"]]} />
        <Pick label="Branch" value={branchF} onChange={setBranchF} opts={[["all", "All branches"], ...branches.map((b) => [b, b])]} />
        <MultiSelect label="Rep" options={reps} excluded={repExcluded}
          onToggle={(r) => setRepExcluded((s) => { const n = new Set(s); n.has(r) ? n.delete(r) : n.add(r); return n; })}
          onAll={() => setRepExcluded(new Set())}
          onNone={() => setRepExcluded(new Set(reps))} />
        <Pick label="Since touch" value={touchWin} onChange={setTouchWin} opts={WIN_OPTS} />
        <Pick label="Lead in" value={leadWin} onChange={setLeadWin} opts={LEAD_WIN_OPTS} />
        {isAdmin && <Pick label="Assigned" value={assignWin} onChange={setAssignWin} opts={ASSIGN_WIN_OPTS} />}
        <Pick label="Claimed by" value={claimedByF} onChange={setClaimedByF}
          opts={[["all", "Anyone"], ["unclaimed", "Unclaimed"],
            ...Object.entries(ACCESS_MAP).map(([em, u]) => [em, u.role === "admin" ? `${u.name} (admin)` : u.name])]} />
      </div>

      {isAdmin && <FieldDiag records={records} />}

      {/* Admin: setter queue review */}
      {isAdmin && setterQueues.length > 0 && (
        <div className="asb-sq">
          <div className="asb-sq-head">
            <Shield size={12} /> Setter queues
            <span>· per setter: opps assigned, how many the setter hasn't touched, and appointments set by the setter vs by the field rep</span>
          </div>
          <div className="asb-sq-table">
            <div className="asb-sq-row asb-sq-th">
              <div>Setter</div><div>Assigned</div><div>No setter touch</div><div>Appt by setter</div><div>Appt by field rep</div>
            </div>
            {setterQueues.map((s) => (
              <div key={s.email} className={`asb-sq-row ${claimedByF === s.email ? "on" : ""}`}
                onClick={() => setClaimedByF(claimedByF === s.email ? "all" : s.email)}
                title={`Filter the board to ${s.name}'s open opps`}>
                <div className="asb-sq-name"><span className="asb-av">{s.initials}</span>{s.name}</div>
                <div className="asb-sq-num" onClick={(e) => { e.stopPropagation(); setDrill(null); setClaimedByF(s.email); }}><b>{s.total}</b></div>
                <div className="asb-sq-num" onClick={(e) => { e.stopPropagation(); setClaimedByF(s.email); setDrill({ by: s.email, metric: "notouch" }); }}>{s.noTouch} <span className="asb-sq-pct">({pct(s.noTouch, s.total)})</span></div>
                <div className="asb-sq-num" onClick={(e) => { e.stopPropagation(); setClaimedByF(s.email); setDrill({ by: s.email, metric: "apptsetter" }); }}>{s.apptBySetter} <span className="asb-sq-pct">({pct(s.apptBySetter, s.total)})</span></div>
                <div className="asb-sq-num" onClick={(e) => { e.stopPropagation(); setClaimedByF(s.email); setDrill({ by: s.email, metric: "apptfield" }); }}>{s.apptByField} <span className="asb-sq-pct">({pct(s.apptByField, s.total)})</span></div>
              </div>
            ))}
          </div>
          <div className="asb-sq-note">
            Assigned counts every opp claimed by the setter{assignWin !== "any" ? " in the selected assignment window" : ""}, including ones that already have an appointment. "Appt by setter" vs "by field rep" is inferred from who logged the appointment in the comments. <b>Click any number</b> to see those exact leads below; click a setter's name to filter the board to their open opps.
          </div>
        </div>
      )}

      {/* Per-setter reconciliation: assigned = open + appt set + other */}
      {recon && !drill && (
        <div className="asb-recon">
          <b>{recon.name}</b> · <b>{recon.total}</b> assigned ={" "}
          <span className="asb-recon-open">{recon.open} shown below</span>
          <span className="asb-recon-cat">({recon.cat.noattempt} no contact · {recon.cat.attempted} attempted · {recon.cat.apptmade} appt made)</span>
          {recon.other > 0 && <> + <span className="asb-recon-other">{recon.other} not shown (quoted / lost / not in feed)</span></>}
          <button className="asb-recon-clear" onClick={() => setClaimedByF("all")}>clear</button>
        </div>
      )}

      {/* Age segment — field rep gets the first hour; team works the older pool */}
      <div className="asb-age">
        <button className={`asb-age-btn ${ageSeg === "aged" ? "on" : ""}`} onClick={() => setAgeSeg("aged")}>
          Older — yours to work <span>{ageTotals.aged}</span>
        </button>
        <button className={`asb-age-btn fresh ${ageSeg === "fresh" ? "on" : ""}`} onClick={() => setAgeSeg("fresh")}>
          Just in &lt;1h — field rep's <span>{ageTotals.fresh}</span>
        </button>
      </div>

      {/* Tabs */}
      <nav className="asb-tabs">
        {TABS.map((t) => (
          <button key={t.id} className={`asb-tab ${tab === t.id ? "on" : ""}`} onClick={() => { setDrill(null); setTab(t.id); }}>
            {t.label}<span className="asb-count">{counts[t.id]}</span>
            <span className="asb-info" onClick={(e) => e.stopPropagation()}>
              <Info size={12} />
              <span className="asb-tip">{t.desc}</span>
            </span>
          </button>
        ))}
      </nav>

      {/* Active category description + what the pool excludes */}
      <div className="asb-desc">
        <b>{TABS.find((t) => t.id === tab)?.label}:</b>{" "}
        {TABS.find((t) => t.id === tab)?.desc}
        <span className="asb-pool" title={POOL_NOTE}><Info size={11} /> What's in this pool?</span>
      </div>

      {/* Admin bulk-assign */}
      {isAdmin && sel.size > 0 && (
        <div className="asb-bulk">
          <b>{sel.size}</b> selected
          <select value={assignTo} onChange={(e) => setAssignTo(e.target.value)}>
            <option value="">Assign to…</option>
            {Object.entries(ACCESS_MAP).filter(([, u]) => u.role === "setter").map(([em, u]) => (
              <option key={em} value={em}>{u.name}</option>
            ))}
          </select>
          <button className="asb-claim" disabled={!assignTo}
            onClick={() => { assignMany([...sel], { email: assignTo, ...ACCESS_MAP[assignTo] }); setSel(new Set()); setAssignTo(""); }}>
            Assign to queue
          </button>
          <button className="asb-bulk-clear" onClick={() => setSel(new Set())}>Clear</button>
        </div>
      )}

      {/* Drill-down banner */}
      {drill && (
        <div className="asb-drill">
          Showing <b>{drillName}</b> · <b>{drillRows.length}</b> {METRIC_LABEL[drill.metric]} — these exact leads, across all categories.
          <button className="asb-drill-clear" onClick={() => setDrill(null)}>← back to board</button>
        </div>
      )}

      {/* Table */}
      <div className={`asb-table ${isAdmin ? "asb-admin" : ""}`}>
        <div className="asb-tr asb-th">
          {isAdmin && <div className="c-sel"></div>}
          <div className="c-claim">Claim</div>
          <div className="c-cust">Customer</div>
          <div className="c-lid">Lead ID</div>
          <div className="c-rep">Rep · Branch</div>
          <div className="c-ms">Milestone</div>
          <div className={`c-num asb-sortable ${sortKey === "touches" ? "on" : ""}`} onClick={() => toggleSort("touches")} title="Click to sort">Touches{sortArrow("touches")}</div>
          <div className={`c-num asb-sortable ${sortKey === "since" ? "on" : ""}`} onClick={() => toggleSort("since")} title="Click to sort">Time since last touch{sortArrow("since")}</div>
          <div className="c-cmt">Last comment</div>
          <div className={`c-date asb-sortable ${sortKey === "leadin" ? "on" : ""}`} onClick={() => toggleSort("leadin")} title="Click to sort">Lead in{sortArrow("leadin")}</div>
          <div className="c-act"></div>
        </div>

        {pageRows.length === 0 && (
          <div className="asb-empty">Nothing in this bucket. Try another tab or clear filters.</div>
        )}

        {pageRows.map((r) => {
          const claim = claimOf(r.leads_id);
          const mine = claim?.by === me?.email;
          const checked = sel.has(r.leads_id);
          return (
            <div className={`asb-tr ${claim ? (mine ? "is-mine" : "is-locked") : ""} ${checked ? "is-sel" : ""}`} key={r.leads_id}>
              {isAdmin && (
                <div className="c-sel">
                  <input type="checkbox" checked={checked} onChange={() => toggleSel(r.leads_id)} />
                </div>
              )}
              <div className="c-claim">
                {!claim && canClaim && <button className="asb-claim" onClick={() => doClaim(r.leads_id)}><Unlock size={13} /> Claim</button>}
                {!claim && !canClaim && <span className="asb-open">Open</span>}
                {claim && (
                  <div className={`asb-chip ${mine ? "mine" : "other"}`} title={`Claimed by ${claim.byName}${claim.at ? ` · ${fmtDur(now - claim.at)} ago` : ""}`}>
                    <span className="asb-av">{claim.initials}</span>
                    <span className="asb-claimed">{(claim.byName || "").split(" ")[0]}</span>
                  </div>
                )}
                {claim && (mine || isAdmin) && (
                  <div className="asb-claim-actions">
                    <button onClick={() => doRelease(r.leads_id)} title="Release back to the pool">Release</button>
                  </div>
                )}
              </div>

              <div className="c-cust"><span className="asb-name">{r.account_name}</span></div>
              <div className="c-lid">#{r.leads_id}</div>

              <div className="c-rep">
                <span className="asb-rep">{r.repName}</span>
                <span className="asb-sub">
                  <span className={`asb-team ${r.team === "NST" ? "nst" : "field"}`}>{r.team}</span>
                  {r.branch}
                </span>
              </div>

              <div className="c-ms"><span className="asb-ms">{r.milestone}</span></div>
              <div className="c-num">{r.touches}</div>
              <div className="c-num"><span className={r.hoursSinceTouch > 168 ? "asb-stale" : ""}>{fmtDur(r.hoursSinceTouch != null ? now - r.lastTouchMs : null)}</span></div>

              <div
                className="c-cmt"
                onMouseEnter={(e) => setHover({ rec: r, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover((h) => h && h.rec.leads_id === r.leads_id ? { ...h, x: e.clientX, y: e.clientY } : h)}
                onMouseLeave={() => setHover(null)}
              >
                <div className="c-cmt-inner">
                  {r.category === "attempted" && r.lastAttemptBy && (
                    <span className="asb-lastby" title={`Last outreach attempt: ${r.lastAttemptBy}`}>
                      ↳ last try: {r.lastAttemptBy}
                    </span>
                  )}
                  <span className="asb-cmt-line">
                    <MessageSquare size={12} className="asb-cmt-ic" />
                    <span className="asb-cmt-txt">{r.lastLine?.text || "—"}</span>
                  </span>
                </div>
              </div>

              <div className="c-date">{r.lead_date_in}</div>

              <div className="c-act">
                <a className="asb-book" href={CRM_RECORD_URL(r.leads_id)} target="_blank" rel="noreferrer" title="Open record in CRM to book">
                  Book <ExternalLink size={12} />
                </a>
              </div>
            </div>
          );
        })}
      </div>

      {/* Pagination */}
      <div className="asb-foot">
        <span>
          {rows.length} record{rows.length !== 1 ? "s" : ""}
          {showAll && rows.length > 0 ? " (showing all)" : ""}
        </span>
        <div className="asb-foot-actions">
          <button className="asb-foot-btn" onClick={exportCSV} disabled={rows.length === 0} title="Download the current section as CSV">
            <Download size={13} /> Export CSV
          </button>
          <button className="asb-foot-btn" onClick={() => setShowAll((s) => !s)}>
            {showAll ? "Paginate" : "Show all"}
          </button>
          {!showAll && (
            <div className="asb-pager">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
              <span>{page + 1} / {pages}</span>
              <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
            </div>
          )}
        </div>
      </div>
      </>
      )}

      {/* Comment hover panel */}
      {hover && (
        <div className="asb-pop" style={{ left: Math.min(hover.x + 16, window.innerWidth - 440), top: Math.min(hover.y + 12, window.innerHeight - 320) }}>
          <div className="asb-pop-head">{hover.rec.account_name} · #{hover.rec.leads_id} · {hover.rec.lines.length} entries · newest first</div>
          <div className="asb-pop-body">
            {[...hover.rec.lines].reverse().map((l, i) => (
              <div className="asb-pop-line" key={i}>
                {l.ts && <span className="asb-pop-ts">{l.ts}</span>}
                {l.who && <span className="asb-pop-who">{l.who}</span>}
                <span className="asb-pop-text">{l.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Seg({ label, value, onChange, opts }) {
  return (
    <div className="asb-seg-wrap">
      <span className="asb-seg-lbl">{label}</span>
      <div className="asb-seg">
        {opts.map(([v, t]) => (
          <button key={v} className={value === v ? "on" : ""} onClick={() => onChange(v)}>{t}</button>
        ))}
      </div>
    </div>
  );
}
function Pick({ label, value, onChange, opts }) {
  return (
    <label className="asb-pick">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {opts.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
      </select>
    </label>
  );
}
function MultiSelect({ label, options, excluded, onToggle, onAll, onNone }) {
  const [open, setOpen] = useState(false);
  const selected = options.length - options.filter((o) => excluded.has(o)).length;
  const allSel = selected === options.length;
  return (
    <div className="asb-ms-wrap">
      <span className="asb-pick-lbl">{label}</span>
      <button className="asb-ms-btn" onClick={() => setOpen((o) => !o)}>
        {allSel ? "All" : `${selected} of ${options.length}`} <span className="asb-ms-caret">▾</span>
      </button>
      {open && (
        <>
          <div className="asb-ms-backdrop" onClick={() => setOpen(false)} />
          <div className="asb-ms-menu">
            <div className="asb-ms-actions">
              <button onClick={onAll}>Select all</button>
              <button onClick={onNone}>Clear all</button>
            </div>
            <div className="asb-ms-list">
              {options.map((o) => (
                <label key={o} className="asb-ms-opt">
                  <input type="checkbox" checked={!excluded.has(o)} onChange={() => onToggle(o)} />
                  {o}
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

const CSS = `
.asb{--ink:#111722;--muted:#697586;--line:#e4e8ee;--surface:#fff;--bg:#f5f7fa;
  --teal:#0d9488;--amber:#b45309;--slate:#475569;--indigo:#4f46e5;--red:#dc2626;--violet:#7c3aed;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);
  background:var(--bg);min-height:100%;padding:18px 20px 40px;font-size:13px;}
.asb *{box-sizing:border-box;}
.asb-mono,.asb-id,.asb-time,.asb-av,.asb-pop-ts,.c-num,.c-date,.asb-count{font-family:ui-monospace,"SF Mono",Menlo,monospace;}

.asb-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;}
.asb-brand{display:flex;gap:12px;align-items:flex-start;}
.asb-gem{flex:none;margin-top:2px;display:inline-flex;filter:drop-shadow(0 2px 5px rgba(120,140,170,.35));}
.asb-brand h1{font-size:18px;font-weight:680;margin:0;letter-spacing:-.01em;}
.asb-brand p{margin:2px 0 0;color:var(--muted);font-size:12px;}
.asb-head-right{display:flex;gap:8px;align-items:center;}
.asb-ghost{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 11px;color:var(--slate);cursor:pointer;font-size:12px;}
.asb-ghost:hover{border-color:#cbd5e1;}
.asb-user{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 9px;color:var(--slate);}
.asb-user select{border:none;background:none;font:inherit;color:var(--ink);outline:none;cursor:pointer;}
.asb-signed{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 11px;color:var(--ink);font-size:12px;font-weight:560;}
.asb-signed .asb-role{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;background:#eef1f6;color:var(--slate);border-radius:5px;padding:1px 6px;font-weight:680;}
.asb-sync{font-size:11px;font-weight:560;display:inline-flex;align-items:center;padding:5px 9px;border-radius:8px;border:1px solid var(--line);}
.asb-sync.live{color:var(--teal);background:#f0fdfa;border-color:#ccf0ea;}
.asb-sync.local{color:var(--amber);background:#fff7ed;border-color:#fde8cf;}
.asb-open{font-size:11px;color:var(--muted);font-style:italic;}

.asb-controls{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px;}
.asb-search{display:flex;align-items:center;gap:7px;background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:8px 11px;flex:1;min-width:220px;color:var(--muted);}
.asb-search input{border:none;outline:none;background:none;font:inherit;flex:1;color:var(--ink);}
.asb-seg-wrap{display:flex;align-items:center;gap:7px;}
.asb-seg-lbl{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
.asb-seg{display:flex;background:var(--surface);border:1px solid var(--line);border-radius:9px;overflow:hidden;}
.asb-seg button{border:none;background:none;padding:7px 12px;font:inherit;color:var(--slate);cursor:pointer;border-right:1px solid var(--line);}
.asb-seg button:last-child{border-right:none;}
.asb-seg button.on{background:var(--ink);color:#fff;}
.asb-pick{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
.asb-pick select{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 10px;font:inherit;text-transform:none;letter-spacing:0;color:var(--ink);cursor:pointer;font-size:12px;}

.asb-ms-wrap{position:relative;display:flex;align-items:center;gap:7px;}
.asb-pick-lbl{color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
.asb-ms-btn{background:var(--surface);border:1px solid var(--line);border-radius:9px;padding:7px 11px;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;display:flex;align-items:center;gap:6px;}
.asb-ms-caret{color:var(--muted);font-size:10px;}
.asb-ms-backdrop{position:fixed;inset:0;z-index:40;}
.asb-ms-menu{position:absolute;top:calc(100% + 6px);left:0;z-index:41;background:#fff;border:1px solid var(--line);border-radius:10px;box-shadow:0 10px 30px rgba(17,23,34,.16);width:230px;padding:8px;}
.asb-ms-actions{display:flex;gap:6px;padding-bottom:8px;margin-bottom:6px;border-bottom:1px solid var(--line);}
.asb-ms-actions button{flex:1;background:#f5f7fa;border:1px solid var(--line);border-radius:7px;padding:5px;font:inherit;font-size:11px;color:var(--slate);cursor:pointer;}
.asb-ms-actions button:hover{border-color:var(--indigo);color:var(--indigo);}
.asb-ms-list{max-height:260px;overflow:auto;}
.asb-ms-opt{display:flex;align-items:center;gap:8px;padding:5px 6px;font-size:12.5px;color:var(--ink);cursor:pointer;border-radius:6px;}
.asb-ms-opt:hover{background:#f7f8fa;}
.asb-ms-opt input{width:14px;height:14px;cursor:pointer;}

.asb-recon{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#eef2ff;border:1px solid #d6dcff;border-radius:9px;padding:9px 13px;margin-top:10px;font-size:12.5px;color:var(--slate);}
.asb-recon b{color:var(--ink);}
.asb-recon-open{color:var(--teal);font-weight:560;}
.asb-recon-appt{color:var(--indigo);font-weight:560;}
.asb-recon-other{color:var(--amber);font-weight:560;}
.asb-recon-cat{color:var(--muted);font-size:11.5px;}
.asb-recon-clear{margin-left:auto;background:none;border:none;color:var(--muted);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;}

.asb-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:2px;}
.asb-tab{border:none;background:none;padding:10px 14px;font:inherit;font-weight:560;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:8px;}
.asb-tab:hover{color:var(--ink);}
.asb-tab.on{color:var(--ink);border-bottom-color:var(--indigo);}
.asb-count{background:#eef1f6;color:var(--slate);border-radius:20px;padding:1px 8px;font-size:11px;}
.asb-tab.on .asb-count{background:var(--indigo);color:#fff;}
.asb-info{position:relative;display:inline-flex;align-items:center;color:var(--muted);cursor:help;}
.asb-info:hover{color:var(--indigo);}
.asb-tip{display:none;position:absolute;top:calc(100% + 8px);left:50%;transform:translateX(-50%);width:270px;background:var(--ink);color:#fff;border-radius:9px;padding:9px 11px;font-size:11.5px;font-weight:450;line-height:1.5;letter-spacing:0;text-transform:none;z-index:60;box-shadow:0 8px 24px rgba(17,23,34,.25);white-space:normal;text-align:left;}
.asb-info:hover .asb-tip{display:block;}
.asb-desc{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:9px;padding:9px 13px;margin-top:10px;font-size:12px;color:var(--slate);line-height:1.5;}
.asb-desc b{color:var(--ink);}
.asb-pool{display:inline-flex;align-items:center;gap:4px;color:var(--indigo);cursor:help;font-weight:560;white-space:nowrap;margin-left:auto;}

.asb-table{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow-x:auto;margin-top:10px;}
.asb-tr{display:grid;grid-template-columns:116px 1.1fr 72px 1.15fr .8fr 62px 116px 1.6fr 80px 74px;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line);min-width:1060px;}
.asb-table.asb-admin .asb-tr{grid-template-columns:30px 116px 1.1fr 72px 1.15fr .8fr 62px 116px 1.6fr 80px 74px;min-width:1100px;}
.asb-tr:last-child{border-bottom:none;}
.asb-th{background:#fafbfc;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:620;padding-top:9px;padding-bottom:9px;}
.asb-sortable{cursor:pointer;user-select:none;}
.asb-sortable:hover{color:var(--indigo);}
.asb-sortable.on{color:var(--indigo);}
.asb-sq{background:#fff;border:1px solid var(--line);border-radius:11px;padding:12px 14px;margin-top:10px;}
.asb-sq-head{display:flex;align-items:center;gap:6px;font-size:11px;font-weight:680;text-transform:uppercase;letter-spacing:.04em;color:var(--indigo);margin-bottom:9px;}
.asb-sq-head span{font-weight:450;text-transform:none;letter-spacing:0;color:var(--muted);font-size:11.5px;}
.asb-sq-table{border:1px solid var(--line);border-radius:9px;overflow:hidden;}
.asb-sq-row{display:grid;grid-template-columns:1.6fr .7fr 1fr 1.1fr .9fr;gap:10px;align-items:center;padding:8px 12px;border-bottom:1px solid var(--line);font-size:12.5px;cursor:pointer;}
.asb-sq-row:last-child{border-bottom:none;}
.asb-sq-row:not(.asb-sq-th):hover{background:#f7f8fa;}
.asb-sq-row.on{background:#eef2ff;}
.asb-sq-th{background:#fafbfc;font-size:10.5px;text-transform:uppercase;letter-spacing:.04em;font-weight:620;color:var(--muted);cursor:default;}
.asb-sq-th:hover{background:#fafbfc;}
.asb-sq-name{display:flex;align-items:center;gap:8px;font-weight:560;}
.asb-sq-name .asb-av{width:22px;height:22px;border-radius:50%;background:var(--slate);color:#fff;font-size:9.5px;font-weight:680;display:inline-flex;align-items:center;justify-content:center;}
.asb-sq-row.on .asb-sq-name .asb-av{background:var(--indigo);}
.asb-sq-row b{font-family:ui-monospace,Menlo,monospace;}
.asb-sq-pct{color:var(--muted);font-size:11px;}
.asb-sq-num{cursor:pointer;border-radius:6px;padding:2px 4px;margin:-2px -4px;}
.asb-sq-num:hover{background:#eef2ff;color:var(--indigo);}
.asb-drill{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#0e1217;color:#fff;border-radius:9px;padding:9px 13px;margin-top:10px;font-size:12.5px;}
.asb-drill b{color:#fff;}
.asb-drill-clear{margin-left:auto;background:rgba(255,255,255,.14);border:none;color:#fff;font:inherit;font-size:12px;cursor:pointer;border-radius:7px;padding:4px 10px;}
.asb-drill-clear:hover{background:rgba(255,255,255,.24);}
.asb-sq-note{font-size:11px;color:var(--muted);margin-top:8px;line-height:1.5;}
.asb-tr.is-mine{background:#f6f5ff;}
.asb-tr.is-locked{background:#fbfbfc;}
.asb-tr.is-sel{background:#eff6ff;}
.c-num,.c-date,.c-lid{font-size:12px;color:var(--slate);}
.c-lid{font-family:ui-monospace,Menlo,monospace;}
.c-sel{display:flex;align-items:center;justify-content:center;}
.c-sel input{width:15px;height:15px;cursor:pointer;}

.asb-claim{display:flex;align-items:center;gap:5px;background:var(--indigo);color:#fff;border:none;border-radius:7px;padding:6px 10px;font:inherit;font-weight:560;cursor:pointer;font-size:12px;}
.asb-claim:hover{background:#4338ca;}
.asb-chip{display:flex;align-items:center;gap:6px;}
.asb-chip .asb-av{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:10px;font-weight:680;color:#fff;flex:none;}
.asb-chip.mine .asb-av{background:var(--indigo);}
.asb-chip.other .asb-av{background:var(--slate);}
.asb-claimed{font-size:11.5px;font-weight:560;color:var(--slate);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.asb-chip.mine .asb-claimed{color:var(--indigo);}
.asb-claim-actions{display:flex;gap:4px;margin-top:4px;}
.asb-claim-actions button{border:1px solid var(--line);background:#fff;border-radius:6px;padding:3px 7px;font:inherit;font-size:10.5px;color:var(--slate);cursor:pointer;}
.asb-claim-actions button:hover{border-color:var(--red);color:var(--red);}

.asb-bulk{display:flex;align-items:center;gap:10px;background:#eef2ff;border:1px solid #d6dcff;border-radius:10px;padding:9px 13px;margin-top:12px;font-size:12.5px;color:var(--slate);}
.asb-bulk b{font-family:ui-monospace,Menlo,monospace;color:var(--indigo);}
.asb-bulk select{background:#fff;border:1px solid var(--line);border-radius:8px;padding:6px 10px;font:inherit;font-size:12px;color:var(--ink);cursor:pointer;}
.asb-bulk .asb-claim{padding:6px 12px;}
.asb-bulk .asb-claim:disabled{opacity:.45;cursor:default;}
.asb-bulk-clear{background:none;border:none;color:var(--muted);font:inherit;font-size:12px;cursor:pointer;text-decoration:underline;}

.asb-name{font-weight:600;display:block;}
.asb-id{color:var(--muted);font-size:11px;}
.asb-rep{font-weight:540;display:block;}
.asb-sub{display:flex;align-items:center;gap:7px;color:var(--muted);font-size:11px;margin-top:2px;}
.asb-team{font-size:9.5px;font-weight:680;text-transform:uppercase;letter-spacing:.03em;padding:1px 6px;border-radius:5px;}
.asb-team.nst{background:#f3e8ff;color:var(--violet);}
.asb-team.field{background:#eef2f6;color:var(--slate);}
.asb-ms{background:#f1f5f9;color:var(--slate);border-radius:6px;padding:3px 8px;font-size:11px;font-weight:540;white-space:nowrap;}
.asb-stale{color:var(--red);font-weight:600;}

.c-cmt{display:flex;align-items:center;gap:6px;min-width:0;cursor:default;}
.asb-cmt-ic{color:var(--muted);flex:none;}
.asb-cmt-txt{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--slate);}
.c-cmt:hover .asb-cmt-txt{color:var(--ink);}

.asb-book{display:inline-flex;align-items:center;gap:4px;background:#fff;border:1px solid var(--line);border-radius:7px;padding:6px 10px;font-weight:560;color:var(--ink);text-decoration:none;font-size:12px;}
.asb-book:hover{border-color:var(--indigo);color:var(--indigo);}

.asb-empty{padding:40px;text-align:center;color:var(--muted);}
.asb-foot{display:flex;justify-content:space-between;align-items:center;margin-top:12px;color:var(--muted);font-size:12px;}
.asb-foot-actions{display:flex;align-items:center;gap:10px;}
.asb-foot-btn{display:flex;align-items:center;gap:6px;border:1px solid var(--line);background:#fff;border-radius:8px;padding:6px 11px;font:inherit;font-size:12px;color:var(--slate);cursor:pointer;}
.asb-foot-btn:hover:not(:disabled){border-color:var(--indigo);color:var(--indigo);}
.asb-foot-btn:disabled{opacity:.45;cursor:default;}
.asb-pager{display:flex;align-items:center;gap:10px;}
.asb-pager button{border:1px solid var(--line);background:#fff;border-radius:7px;padding:5px 8px;cursor:pointer;color:var(--slate);display:flex;}
.asb-pager button:disabled{opacity:.4;cursor:default;}

.asb-pop{position:fixed;width:420px;max-height:300px;overflow:hidden;background:#fff;border:1px solid var(--line);border-radius:11px;box-shadow:0 12px 40px rgba(17,23,34,.18);z-index:50;pointer-events:none;display:flex;flex-direction:column;}
.asb-pop-head{padding:9px 12px;border-bottom:1px solid var(--line);font-weight:600;font-size:12px;background:#fafbfc;}
.asb-pop-body{overflow:auto;padding:6px 0;}
.asb-pop-line{display:grid;grid-template-columns:130px 110px 1fr;gap:8px;padding:5px 12px;font-size:11px;border-bottom:1px solid #f1f3f6;}
.asb-pop-line:last-child{border-bottom:none;}
.asb-pop-ts{color:var(--muted);font-size:10px;}
.asb-pop-who{color:var(--indigo);font-weight:560;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
.asb-pop-text{color:var(--ink);}

.asb-status{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:80px 24px;text-align:center;color:var(--muted);}
.asb-spin{width:34px;height:34px;border:3px solid var(--line);border-top-color:var(--indigo);border-radius:50%;animation:asb-spin .8s linear infinite;}
@keyframes asb-spin{to{transform:rotate(360deg);}}
.asb-status-err{color:var(--ink);max-width:520px;margin:40px auto;background:#fff;border:1px solid var(--line);border-radius:12px;}
.asb-err-title{font-weight:680;font-size:15px;color:var(--red);margin:0;}
.asb-err-detail{font-family:ui-monospace,Menlo,monospace;font-size:12px;color:var(--slate);background:#f5f7fa;border-radius:7px;padding:8px 10px;margin:0;}
.asb-err-hint{font-size:12px;color:var(--muted);margin:0;line-height:1.5;}

.asb-diag{margin:10px 0 0;}
.asb-diag-toggle{display:inline-flex;align-items:center;gap:6px;background:#f3f0ff;color:var(--indigo);border:1px solid #e0d8ff;border-radius:8px;padding:6px 11px;font:inherit;font-size:12px;font-weight:560;cursor:pointer;}
.asb-diag-grid{display:flex;gap:14px;flex-wrap:wrap;background:#fff;border:1px solid var(--line);border-radius:10px;padding:12px 14px;margin-top:8px;}
.asb-diag-col{min-width:150px;}
.asb-diag-field{font-family:ui-monospace,Menlo,monospace;font-size:11px;font-weight:680;color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:4px;margin-bottom:5px;}
.asb-diag-row{display:flex;justify-content:space-between;gap:10px;font-size:11.5px;color:var(--slate);padding:2px 0;}
.asb-diag-row b{font-family:ui-monospace,Menlo,monospace;color:var(--ink);}

.asb-age{display:flex;gap:8px;margin:12px 0 2px;}
.asb-age-btn{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--line);border-radius:9px;padding:8px 13px;font:inherit;font-size:12.5px;font-weight:560;color:var(--slate);cursor:pointer;}
.asb-age-btn span{font-family:ui-monospace,Menlo,monospace;background:#eef1f6;border-radius:20px;padding:1px 8px;font-size:11px;}
.asb-age-btn.on{border-color:var(--teal);color:var(--teal);background:#f0fdfa;}
.asb-age-btn.on span{background:var(--teal);color:#fff;}
.asb-age-btn.fresh.on{border-color:var(--amber);color:var(--amber);background:#fff7ed;}
.asb-age-btn.fresh.on span{background:var(--amber);color:#fff;}

.c-cmt-inner{min-width:0;display:flex;flex-direction:column;gap:2px;}
.asb-cmt-line{display:flex;align-items:center;gap:6px;min-width:0;}
.asb-lastby{align-self:flex-start;background:#fef3c7;color:#92400e;border-radius:5px;padding:1px 7px;font-size:10.5px;font-weight:620;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%;}

@media (max-width:1100px){
  .asb-controls{gap:8px;}
}
`;

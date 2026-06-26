import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Lock, Unlock, Phone, Mail, Clock, ExternalLink, Search,
  ChevronLeft, ChevronRight, RefreshCw, Shield, User, MessageSquare
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
// EM Duggan partner channel — excluded from the pool (matches SalesRep POOL_EXCLUDE_RE).
const POOL_EXCLUDE_RE = /\be\.?\s*m\.?\s*duggan\b/i;

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
const apptBooked = (r) => isVal(r["Set Appt"]) || isVal(r["Appt. Completed"]) || isVal(r["CDR Appt. Done"]);
const isLost = (r) =>
  r.status_id === 6 || /lost\s*sale/i.test(r.status || "") || LOST_RE.test(r.comments || "");
const isResidential = (r) => String(r.professional).toLowerCase() !== "true" && !isCommercial(r);

function enrich(r, now) {
  const p = parseComments(r.comments);
  const repName = (r.salesreps_name || "").replace(/\s*-\s*National Sales\s*$/i, "").trim();
  const lastTouchMs = p.lastTs ? Date.parse(p.lastTs.replace(" ", "T")) : null;
  const firstMs = p.firstTs ? Date.parse(p.firstTs.replace(" ", "T")) : Date.parse(r.lead_date_in + "T00:00:00");
  // Exact lead-in timestamp now available; fall back to first comment if missing.
  const leadInMs = isVal(r.lead_created_time)
    ? Date.parse(String(r.lead_created_time).replace(" ", "T"))
    : firstMs;
  const contacted = p.contacted || isVal(r.Contact);
  let category = "nocontact";
  if (contacted) category = "contacted";
  else if (p.touches > 0) category = "attempted";
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
    touches: p.touches,
    contacted,
    lastAttemptBy: p.lastAttemptBy,
    lastAttemptTs: p.lastAttemptTs,
    lines: p.lines,
    lastLine: p.lastLine,
    lastTouchMs,
    firstMs,
    leadInMs,
    ageBucket,
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
  { id: "nocontact", label: "No contact" },
  { id: "attempted", label: "Attempted · no success" },
  { id: "contacted", label: "Contacted · no appt" },
  { id: "mine", label: "My queue" },
];

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
  const [claims, setClaims] = useState({}); // PROD: loadClaims() from shared store
  const [tab, setTab] = useState("nocontact");
  const [q, setQ] = useState("");
  const [teamF, setTeamF] = useState("all");
  const [branchF, setBranchF] = useState("all");
  const [sort, setSort] = useState("newest");
  const [ageSeg, setAgeSeg] = useState("aged"); // aged (>1h) | fresh (<1h)
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

  const claimOf = (id) => {
    const c = claims[id];
    if (!c || c.expiresAt <= now) return null; // expired = auto-released
    return c;
  };
  const canClaim = me && (me.role === "setter" || me.role === "admin");
  const saveClaim = (id, claim) => setClaims((p) => ({ ...p, [id]: claim })); // PROD: POST to shared store
  const doClaim = (id) => {
    if (!canClaim) return;
    saveClaim(id, { by: me.email, byName: me.name, initials: me.initials, at: now, expiresAt: now + CLAIM_HOURS * 3.6e6 });
  };
  const doRelease = (id) => setClaims((p) => { const n = { ...p }; delete n[id]; return n; });
  const doExtend = (id) =>
    setClaims((p) => ({ ...p, [id]: { ...p[id], expiresAt: now + CLAIM_HOURS * 3.6e6 } }));

  // enrich + eligibility filter
  const eligible = useMemo(() => {
    return (records || []).map((r) => enrich(r, now)).filter((r) => {
      if (!isResidential(r)) return false;        // residential only
      if (isSLead(r)) return false;               // drop sLeads
      if (String(r.relead || "").trim().toLowerCase() === "y") return false; // drop releads
      if (isLost(r)) return false;                // drop lost
      if (apptBooked(r)) return false;            // drop already-booked
      if (POOL_EXCLUDE_RE.test(r.salesreps_name || "")) return false; // drop EM Duggan
      if (EXCLUDED_ACCOUNT_CLASSES.includes(String(r.account_class || "").trim().toLowerCase())) return false; // drop prospects/customers
      return true;                                // fresh (<1h) kept; segmented in the UI
    });
  }, [records, now]);

  const ageTotals = useMemo(() => {
    const t = { fresh: 0, aged: 0 };
    eligible.forEach((r) => { t[r.ageBucket]++; });
    return t;
  }, [eligible]);
  const segEligible = useMemo(() => eligible.filter((r) => r.ageBucket === ageSeg), [eligible, ageSeg]);

  const counts = useMemo(() => {
    const c = { nocontact: 0, attempted: 0, contacted: 0, mine: 0 };
    segEligible.forEach((r) => { c[r.category]++; if (claimOf(r.leads_id)?.by === me?.email) c.mine++; });
    return c;
  }, [segEligible, claims, now, me?.email]);

  const branches = useMemo(
    () => Array.from(new Set(eligible.map((r) => r.branch))).filter((b) => b !== "—").sort(),
    [eligible]
  );

  const rows = useMemo(() => {
    let list = segEligible.filter((r) => {
      if (tab === "mine") { if (claimOf(r.leads_id)?.by !== me?.email) return false; }
      else if (r.category !== tab) return false;
      if (teamF !== "all" && r.team !== teamF) return false;
      if (branchF !== "all" && r.branch !== branchF) return false;
      if (q) {
        const hay = `${r.account_name} ${r.repName} ${r.leads_id}`.toLowerCase();
        if (!hay.includes(q.toLowerCase())) return false;
      }
      return true;
    });
    const cmp = {
      newest: (a, b) => b.lead_date_in.localeCompare(a.lead_date_in),
      oldest: (a, b) => a.lead_date_in.localeCompare(b.lead_date_in),
      touches: (a, b) => b.touches - a.touches,
      stale: (a, b) => (b.hoursSinceTouch ?? 0) - (a.hoursSinceTouch ?? 0),
    }[sort];
    return [...list].sort(cmp);
  }, [segEligible, tab, teamF, branchF, q, sort, claims, now, me?.email]);

  useEffect(() => setPage(0), [tab, teamF, branchF, q, sort, ageSeg]);
  const pages = Math.max(1, Math.ceil(rows.length / PAGE));
  const pageRows = rows.slice(page * PAGE, page * PAGE + PAGE);

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
          <span className="asb-drop" />
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
          <input placeholder="Search name, rep, or lead ID" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Seg label="Team" value={teamF} onChange={setTeamF} opts={[["all", "All"], ["Field", "Field"], ["NST", "NST"]]} />
        <Pick label="Branch" value={branchF} onChange={setBranchF} opts={[["all", "All branches"], ...branches.map((b) => [b, b])]} />
        <Pick label="Sort" value={sort} onChange={setSort} opts={[["newest", "Newest lead in"], ["oldest", "Oldest lead in"], ["touches", "Most touches"], ["stale", "Longest since touch"]]} />
      </div>

      {isAdmin && <FieldDiag records={records} />}

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
          <button key={t.id} className={`asb-tab ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
            {t.label}<span className="asb-count">{counts[t.id]}</span>
          </button>
        ))}
      </nav>

      {/* Table */}
      <div className="asb-table">
        <div className="asb-tr asb-th">
          <div className="c-claim">Claim</div>
          <div className="c-cust">Customer</div>
          <div className="c-rep">Rep · Branch</div>
          <div className="c-ms">Milestone</div>
          <div className="c-num">Touches</div>
          <div className="c-num">Since touch</div>
          <div className="c-cmt">Last comment</div>
          <div className="c-date">Lead in</div>
          <div className="c-act"></div>
        </div>

        {pageRows.length === 0 && (
          <div className="asb-empty">Nothing in this bucket. Try another tab or clear filters.</div>
        )}

        {pageRows.map((r) => {
          const claim = claimOf(r.leads_id);
          const mine = claim?.by === me?.email;
          const remaining = claim ? claim.expiresAt - now : 0;
          const pct = claim ? Math.max(0, Math.min(100, (remaining / (CLAIM_HOURS * 3.6e6)) * 100)) : 0;
          return (
            <div className={`asb-tr ${claim ? (mine ? "is-mine" : "is-locked") : ""}`} key={r.leads_id}>
              <div className="c-claim">
                {!claim && canClaim && <button className="asb-claim" onClick={() => doClaim(r.leads_id)}><Unlock size={13} /> Claim</button>}
                {!claim && !canClaim && <span className="asb-open">Open</span>}
                {claim && (
                  <div className={`asb-chip ${mine ? "mine" : "other"}`} title={`${claim.byName} · ${fmtClock(remaining)} left`}>
                    <span className="asb-av">{claim.initials}</span>
                    <span className="asb-time"><Clock size={11} />{fmtClock(remaining)}</span>
                    <span className="asb-bar"><i style={{ width: `${pct}%` }} /></span>
                  </div>
                )}
                {claim && (mine || isAdmin) && (
                  <div className="asb-claim-actions">
                    <button onClick={() => doRelease(r.leads_id)} title="Release">Release</button>
                    {isAdmin && <button onClick={() => doExtend(r.leads_id)} title="Reset to 24h">Extend</button>}
                  </div>
                )}
              </div>

              <div className="c-cust">
                <span className="asb-name">{r.account_name}</span>
                <span className="asb-id">#{r.leads_id}</span>
              </div>

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
        <span>{rows.length} record{rows.length !== 1 ? "s" : ""}</span>
        <div className="asb-pager">
          <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}><ChevronLeft size={14} /></button>
          <span>{page + 1} / {pages}</span>
          <button disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)}><ChevronRight size={14} /></button>
        </div>
      </div>
      </>
      )}

      {/* Comment hover panel */}
      {hover && (
        <div className="asb-pop" style={{ left: Math.min(hover.x + 16, window.innerWidth - 440), top: Math.min(hover.y + 12, window.innerHeight - 320) }}>
          <div className="asb-pop-head">{hover.rec.account_name} · #{hover.rec.leads_id} · {hover.rec.lines.length} entries</div>
          <div className="asb-pop-body">
            {hover.rec.lines.map((l, i) => (
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

const CSS = `
.asb{--ink:#111722;--muted:#697586;--line:#e4e8ee;--surface:#fff;--bg:#f5f7fa;
  --teal:#0d9488;--amber:#b45309;--slate:#475569;--indigo:#4f46e5;--red:#dc2626;--violet:#7c3aed;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink);
  background:var(--bg);min-height:100%;padding:18px 20px 40px;font-size:13px;}
.asb *{box-sizing:border-box;}
.asb-mono,.asb-id,.asb-time,.asb-av,.asb-pop-ts,.c-num,.c-date,.asb-count{font-family:ui-monospace,"SF Mono",Menlo,monospace;}

.asb-head{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:16px;}
.asb-brand{display:flex;gap:12px;align-items:flex-start;}
.asb-drop{width:30px;height:30px;border-radius:50% 50% 50% 0;background:linear-gradient(150deg,#22d3ee,#0d9488);transform:rotate(-45deg);flex:none;margin-top:2px;box-shadow:0 2px 8px rgba(13,148,136,.35);}
.asb-brand h1{font-size:18px;font-weight:680;margin:0;letter-spacing:-.01em;}
.asb-brand p{margin:2px 0 0;color:var(--muted);font-size:12px;}
.asb-head-right{display:flex;gap:8px;align-items:center;}
.asb-ghost{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:7px 11px;color:var(--slate);cursor:pointer;font-size:12px;}
.asb-ghost:hover{border-color:#cbd5e1;}
.asb-user{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:5px 9px;color:var(--slate);}
.asb-user select{border:none;background:none;font:inherit;color:var(--ink);outline:none;cursor:pointer;}
.asb-signed{display:flex;align-items:center;gap:6px;background:var(--surface);border:1px solid var(--line);border-radius:8px;padding:6px 11px;color:var(--ink);font-size:12px;font-weight:560;}
.asb-signed .asb-role{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;background:#eef1f6;color:var(--slate);border-radius:5px;padding:1px 6px;font-weight:680;}
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

.asb-tabs{display:flex;gap:4px;border-bottom:1px solid var(--line);margin-bottom:2px;}
.asb-tab{border:none;background:none;padding:10px 14px;font:inherit;font-weight:560;color:var(--muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;display:flex;align-items:center;gap:8px;}
.asb-tab:hover{color:var(--ink);}
.asb-tab.on{color:var(--ink);border-bottom-color:var(--indigo);}
.asb-count{background:#eef1f6;color:var(--slate);border-radius:20px;padding:1px 8px;font-size:11px;}
.asb-tab.on .asb-count{background:var(--indigo);color:#fff;}

.asb-table{background:var(--surface);border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:10px;}
.asb-tr{display:grid;grid-template-columns:118px 1.3fr 1.2fr .9fr 72px 88px 2fr 88px 78px;gap:12px;align-items:center;padding:11px 14px;border-bottom:1px solid var(--line);}
.asb-tr:last-child{border-bottom:none;}
.asb-th{background:#fafbfc;color:var(--muted);font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;font-weight:620;padding-top:9px;padding-bottom:9px;}
.asb-tr.is-mine{background:#f6f5ff;}
.asb-tr.is-locked{background:#fbfbfc;opacity:.78;}
.c-num,.c-date{font-size:12px;color:var(--slate);}

.asb-claim{display:flex;align-items:center;gap:5px;background:var(--indigo);color:#fff;border:none;border-radius:7px;padding:6px 10px;font:inherit;font-weight:560;cursor:pointer;font-size:12px;}
.asb-claim:hover{background:#4338ca;}
.asb-chip{display:flex;flex-direction:column;gap:3px;}
.asb-chip .asb-av{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:6px;font-size:10px;font-weight:680;color:#fff;}
.asb-chip.mine .asb-av{background:var(--indigo);}
.asb-chip.other .asb-av{background:var(--slate);}
.asb-chip{position:relative;}
.asb-time{display:flex;align-items:center;gap:3px;font-size:11px;color:var(--slate);}
.asb-bar{display:block;height:3px;background:#e4e8ee;border-radius:3px;overflow:hidden;width:64px;}
.asb-bar i{display:block;height:100%;background:var(--indigo);transition:width .4s;}
.asb-chip.other .asb-bar i{background:var(--slate);}
.asb-claim-actions{display:flex;gap:4px;margin-top:4px;}
.asb-claim-actions button{border:1px solid var(--line);background:#fff;border-radius:6px;padding:3px 7px;font:inherit;font-size:10.5px;color:var(--slate);cursor:pointer;}
.asb-claim-actions button:hover{border-color:var(--red);color:var(--red);}

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
  .asb-tr{grid-template-columns:110px 1.2fr 1fr 70px 80px 1.6fr 78px;}
  .c-ms,.c-date{display:none;}
}
`;

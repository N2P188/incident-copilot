// api/incident-intake.js
import { askLLMAsJson } from "../lib/llm.js";
import { buildIncidentPrompt } from "../lib/prompts.js";
import { put } from "@vercel/blob";

// --- CORS erlauben ---
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// --- Datumshilfen ---
function addHours(date, hours) { return new Date(date.getTime() + hours * 3600000); }
function addDays(date, days) { return new Date(date.getTime() + days * 86400000); }
function toISO(dt) { return dt.toISOString().replace(/\.\d{3}Z$/, "Z"); }

// --- Offset aus dem Request ziehen ---
function extractOffset(reqBody) {
  if (!reqBody) return null;
  const candidates = [
    ["awarenessOffsetMinutes", 1],
    ["awarenessClientOffsetMinutes", 1],
    ["awarenessTimezoneOffset", -1],
    ["awarenessClientTimezoneOffset", -1],
  ];
  for (const [field, mult] of candidates) {
    if (reqBody[field] === undefined || reqBody[field] === null || reqBody[field] === "") continue;
    const n = Number(reqBody[field]);
    if (!Number.isFinite(n)) continue;
    return { source: field, rawMinutes: n, appliedMinutes: n * mult };
  }
  return null;
}

// --- Awareness-Zeit robust parsen ---
function parseAwareness(reqBody) {
  const raw = (reqBody && reqBody.awarenessTime ? String(reqBody.awarenessTime) : "").trim();
  if (!raw) return { dt: new Date(), source: "fallback_now", received: raw, offsetMinutes: null };

  const normalized = raw.replace(" ", "T");
  const off = extractOffset(reqBody);

  // "YYYY-MM-DDTHH:mm"
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (m) {
    const Y = Number(m[1]), Mo = Number(m[2]), D = Number(m[3]), H = Number(m[4]), Mi = Number(m[5]);
    const baseUtc = Date.UTC(Y, Mo - 1, D, H, Mi);
    if (off) {
      const dt = new Date(baseUtc - off.appliedMinutes * 60000);
      return { dt, source: `datetime-local(${off.source})`, received: raw, offsetMinutes: off.appliedMinutes };
    }
    return { dt: new Date(baseUtc), source: "datetime-local(assumed-utc)", received: raw, offsetMinutes: null };
  }

  const dt = new Date(normalized);
  if (!isNaN(dt)) return { dt, source: "parsed_iso", received: raw, offsetMinutes: null };

  return { dt: new Date(), source: "invalid_fallback_now", received: raw, offsetMinutes: null };
}

// ===== Upload-Helfer =====
const MAX_FILES = 3;
const MAX_SIZE = 3 * 1024 * 1024; // 3 MB

const ALLOWED_MIME = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "message/rfc822",               // .eml
  "application/vnd.ms-outlook",   // .msg
  "image/png",
  "image/jpeg",
  "application/octet-stream"      // Fallback
]);

const ALLOWED_EXT = [".pdf", ".doc", ".docx", ".eml", ".msg", ".png", ".jpg", ".jpeg"];

function hasAllowedExt(name) {
  const lower = String(name || "").toLowerCase();
  return ALLOWED_EXT.some(ext => lower.endsWith(ext));
}

function sanitizeName(name) {
  return String(name)
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);
}

async function uploadFilesToBlob(intakeId, filesInput) {
  const files = Array.isArray(filesInput) ? filesInput : [];
  if (files.length > MAX_FILES) throw new Error("Maximal 3 Dateien erlaubt.");

  const out = [];
  for (const f of files) {
    const nameRaw = f?.name || "";
    const name = sanitizeName(nameRaw);
    const type = String(f?.type || "") || "application/octet-stream";
    const size = Number(f?.size || 0);
    const base64 = String(f?.data || "");

    if (!name || !base64) continue;
    if (size > MAX_SIZE) throw new Error(`Datei zu groß: ${name} (max. 3 MB)`);
    if (!ALLOWED_MIME.has(type) && !hasAllowedExt(name)) {
      throw new Error(`Dateityp/Endung nicht erlaubt: ${name} (${type || "unknown"})`);
    }

    const buffer = Buffer.from(base64, "base64");
    const path = `${intakeId}/${Date.now()}-${name}`;

    const { url, pathname, size: storedSize } = await put(path, buffer, {
      access: "public",
      contentType: type
    });

    out.push({
      name,
      type,
      size: storedSize ?? size,
      url,
      blobPath: pathname
    });
  }
  return out;
}
// ===== Ende Upload-Helfer =====

export const config = { api: { bodyParser: { sizeLimit: "20mb" } } };

export default async function handler(req, res) {
  setCORS(res);
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST" });

  const { contactEmail, freeText, files } = req.body || {};
  if (!contactEmail || !freeText) {
    return res.status(400).json({ error: "contactEmail und freeText sind Pflicht" });
  }

  const { dt: awareness, source: awarenessSource, received: awarenessReceived, offsetMinutes: awarenessOffsetMinutes } =
    parseAwareness(req.body);

  const due = {
    earlyWarning: toISO(addHours(awareness, 24)),
    incidentNotification: toISO(addHours(awareness, 72)),
    finalReport: toISO(addDays(awareness, 30)),
  };

  const intakeId = "demo-" + Date.now();

  let uploaded = [];
  try {
    uploaded = await uploadFilesToBlob(intakeId, files);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }

  // === KI-Drafts erzeugen (mit Fallback) ===
  let aiDrafts;
  try {
    const { system, user } = buildIncidentPrompt({
      contactEmail,
      awarenessUtc: toISO(awareness),
      freeText,
      files: uploaded
    });
    aiDrafts = await askLLMAsJson({ system, user }); // Modell steht in lib/llm.js
  } catch (_e) {
    aiDrafts = {
      earlyWarning: {
        reportType: "EARLY_WARNING",
        summary: "TODO: KI nicht verfügbar – kurze Lagezusammenfassung ergänzen.",
        awarenessTimeUTC: toISO(awareness),
        initialImpact: "TODO",
        likelyCause: "TODO (unsicher)",
        mitigationSteps: [],
        nextActions: []
      },
      incidentNotification: {
        reportType: "INCIDENT_NOTIFICATION",
        summary: "TODO: KI nicht verfügbar – Zwischenstand ergänzen.",
        timeline: [],
        affectedServices: [],
        affectedRegions: [],
        userImpact: "TODO",
        indicatorsOfCompromise: [],
        legalAndRegulatory: [],
        mitigationSteps: [],
        openQuestions: []
      },
      finalReport: {
        reportType: "FINAL_REPORT",
        rootCause: "TODO",
        detailedImpact: "TODO",
        dataSubjectsOrRecords: "TODO",
        fullTimeline: [],
        lessonsLearned: [],
        preventiveMeasures: [],
        attachmentsNote: "Anhänge wurden (noch) nicht inhaltlich ausgewertet."
      }
    };
  }

  // --- Response ---
  return res.status(200).json({
    intakeId,
    awarenessReceived,
    awarenessSource,
    awarenessOffsetMinutes,
    awarenessTime: toISO(awareness),
    due,
    files: uploaded,
    drafts: aiDrafts
  });
}

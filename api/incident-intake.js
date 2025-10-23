// api/incident-intake.js

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

// --- Awareness-Zeit aus Request robust parsen ---
function parseAwareness(reqBody) {
  const raw = (reqBody && reqBody.awarenessTime ? String(reqBody.awarenessTime) : "").trim();
  if (!raw) return { dt: new Date(), source: "fallback_now", received: raw, offsetMinutes: null };

  const normalized = raw.replace(" ", "T"); // Safari/Locale-Fix
  const off = extractOffset(reqBody);

  // "YYYY-MM-DDTHH:mm" (datetime-local)
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (m) {
    const Y = Number(m[1]), Mo = Number(m[2]), D = Number(m[3]), H = Number(m[4]), Mi = Number(m[5]);
    const baseUtc = Date.UTC(Y, Mo - 1, D, H, Mi);
    if (off) {
      // Offset anwenden: lokale Zeit -> UTC
      const dt = new Date(baseUtc - off.appliedMinutes * 60000);
      return { dt, source: `datetime-local(${off.source})`, received: raw, offsetMinutes: off.appliedMinutes };
    }
    // Fallback: als UTC interpretieren
    return { dt: new Date(baseUtc), source: "datetime-local(assumed-utc)", received: raw, offsetMinutes: null };
  }

  // ISO mit Zeitzone etc.
  const dt = new Date(normalized);
  if (!isNaN(dt)) return { dt, source: "parsed_iso", received: raw, offsetMinutes: null };

  return { dt: new Date(), source: "invalid_fallback_now", received: raw, offsetMinutes: null };
}

// --- Dateien entgegennehmen (nur Metadaten im MVP) ---
function collectFiles(filesInput) {
  const MAX_FILES = 3, MAX_SIZE = 3 * 1024 * 1024;
  const files = Array.isArray(filesInput) ? filesInput : [];
  if (files.length > MAX_FILES) throw new Error("Maximal 3 Dateien erlaubt.");
  const out = [];
  for (const f of files) {
    const name = String(f?.name || "").slice(0, 200);
    const type = String(f?.type || "") || "unknown";
    const size = Number(f?.size || 0);
    const base64 = String(f?.data || "");
    if (!name || !base64) continue;
    if (size > MAX_SIZE) throw new Error(`Datei zu groß: ${name} (max. 3 MB)`);
    out.push({ name, type, size });
  }
  return out;
}

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

  let filesMeta = [];
  try { filesMeta = collectFiles(files); }
  catch (e) { return res.status(400).json({ error: String(e.message || e) }); }

  return res.status(200).json({
    intakeId: "demo-" + Date.now(),
    awarenessReceived,            // was vom Browser kam ("2025-10-19T12:00")
    awarenessSource,              // wie interpretiert (z. B. datetime-local(awarenessOffsetMinutes))
    awarenessOffsetMinutes,       // z. B. 120
    awarenessTime: toISO(awareness), // UTC
    due,                          // +24h/+72h/+30d
    files: filesMeta,
    drafts: {
      earlyWarning: { reportType: "EARLY_WARNING" },
      incidentNotification: { reportType: "INCIDENT_NOTIFICATION" },
      finalReport: { reportType: "FINAL_REPORT" }
    }
  });
}

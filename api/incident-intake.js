// api/incident-intake.js
import crypto from "crypto";

// ===== CORS erlauben (für Framer) =====
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

// ===== Datumshilfen =====
function addHours(date, hours) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}
function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}
function toISO(dt) {
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ===== Awareness aus Request robust parsen =====
function parseAwareness(reqBody) {
  const s = (reqBody && reqBody.awarenessTime || "").trim();
  if (!s) return new Date();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (m) {
    const [_, Y, Mo, D, H, Mi] = m.map(Number);
    return new Date(Y, Mo - 1, D, H, Mi); // lokale Zeit
  }
  const dt = new Date(s);
  if (!isNaN(dt)) return dt;
  return new Date();
}

// ===== Dateien prüfen & hashen =====
function parseFiles(filesInput) {
  const MAX_FILES = 3;
  const MAX_SIZE = 3 * 1024 * 1024; // 3 MB pro Datei
  const ALLOWED_TYPES = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "message/rfc822",
    "application/vnd.ms-outlook",
    "image/png",
    "image/jpeg"
  ];

  const files = Array.isArray(filesInput) ? filesInput : [];
  if (files.length > MAX_FILES) throw new Error("Maximal 3 Dateien erlaubt.");

  const out = [];
  for (const f of files) {
    const name = String(f?.name || "").slice(0, 200);
    const type = String(f?.type || "");
    const size = Number(f?.size || 0);
    const base64 = String(f?.data || "");

    if (!name || !base64) continue; // leere Einträge ignorieren
    if (size > MAX_SIZE) throw new Error(`Datei zu groß: ${name} (max. 3 MB)`);
    if (ALLOWED_TYPES.length && type && !ALLOWED_TYPES.includes(type)) {
      // Typ nicht kritisch: wir lassen durch, markieren aber als "unknown"
    }

    // Base64 -> Buffer
    let buf;
    try {
      buf = Buffer.from(base64, "base64");
    } catch {
      throw new Error(`Ungültiges Datei-Format: ${name}`);
    }

    // Hash berechnen
    const sha256 = crypto.createHash("sha256").update(buf).digest("hex");

    out.push({
      name,
      type: type || "unknown",
      size,
      sha256,
      // Für MVP speichern/versenden wir die Datei noch NICHT.
      // Später: Upload zu Storage (z.B. Vercel Blob / S3) und URL hier zurückgeben.
    });
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

  // Awareness
  const awareness = parseAwareness(req.body);

  // Deadlines (UTC)
  const due = {
    earlyWarning: toISO(addHours(awareness, 24)),
    incidentNotification: toISO(addHours(awareness, 72)),
    finalReport: toISO(addDays(awareness, 30)),
  };

  // Dateien einlesen + hashen (MVP)
  let filesMeta = [];
  try {
    filesMeta = parseFiles(files);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }

  // Antwort (MVP)
  return res.status(200).json({
    intakeId: "demo-" + Date.now(),
    awarenessTime: toISO(awareness),
    due,
    files: filesMeta,
    drafts: {
      earlyWarning: { reportType: "EARLY_WARNING" },
      incidentNotification: { reportType: "INCIDENT_NOTIFICATION" },
      finalReport: { reportType: "FINAL_REPORT" }
    }
  });
}

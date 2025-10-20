// api/incident-intake.js

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
// Akzeptiert:
//  - "YYYY-MM-DDTHH:mm" (vom <input type="datetime-local">) -> lokale Zeit
//  - ISO-Strings mit Zeitzone
function parseAwareness(reqBody) {
  const raw = (reqBody && reqBody.awarenessTime ? String(reqBody.awarenessTime) : "").trim();
  if (!raw) return { dt: new Date(), source: "fallback_now", received: raw };

  const normalized = raw.replace(" ", "T"); // Safari/Locale-Fix
  const m = normalized.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (m) {
    const [_, Y, Mo, D, H, Mi] = m.map(Number);
    const local = new Date(Y, Mo - 1, D, H, Mi); // lokale Zeit
    return { dt: local, source: "datetime-local", received: raw };
  }

  const dt = new Date(normalized);
  if (!isNaN(dt)) return { dt, source: "parsed_iso", received: raw };

  return { dt: new Date(), source: "invalid_fallback_now", received: raw };
}

// ===== Dateien nur als Metadaten akzeptieren (ohne Node-Imports) =====
function collectFiles(filesInput) {
  const MAX_FILES = 3;
  const MAX_SIZE = 3 * 1024 * 1024;
  const files = Array.isArray(filesInput) ? filesInput : [];
  if (files.length > MAX_FILES) throw new Error("Maximal 3 Dateien erlaubt.");

  const out = [];
  for (const f of files) {
    const name = String(f?.name || "").slice(0, 200);
    const type = String(f?.type || "");
    const size = Number(f?.size || 0);
    const base64 = String(f?.data || "");

    if (!name || !base64) continue;
    if (size > MAX_SIZE) throw new Error(`Datei zu groß: ${name} (max. 3 MB)`);

    // Fürs MVP speichern wir nicht. Nur Metadaten zurückgeben.
    out.push({ name, type: type || "unknown", size });
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

  // Awareness interpretieren
  const { dt: awareness, source: awarenessSource, received: awarenessReceived } = parseAwareness(req.body);

  // Deadlines berechnen (UTC)
  const due = {
    earlyWarning: toISO(addHours(awareness, 24)),
    incidentNotification: toISO(addHours(awareness, 72)),
    finalReport: toISO(addDays(awareness, 30)),
  };

  // Dateien einsammeln (nur Metadaten)
  let filesMeta = [];
  try {
    filesMeta = collectFiles(files);
  } catch (e) {
    return res.status(400).json({ error: String(e.message || e) });
  }

  // Antwort inkl. Debug-Felder, damit du siehst, WAS ankam
  return res.status(200).json({
    intakeId: "demo-" + Date.now(),
    awarenessReceived, // das kam vom Browser
    awarenessSource,   // wie wir es interpretiert haben
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

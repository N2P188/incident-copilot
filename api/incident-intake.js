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
  // kompaktes ISO mit Z
  return dt.toISOString().replace(/\.\d{3}Z$/, "Z");
}

// ===== Awareness aus Request robust parsen =====
// Erwartet entweder:
//  - "YYYY-MM-DDTHH:mm" (von <input type="datetime-local">, lokale Zeit) oder
//  - ein anderes Date-Format/ISO (mit Zeitzone)
function parseAwareness(reqBody) {
  const s = (reqBody && reqBody.awarenessTime || "").trim();
  if (!s) return new Date(); // Fallback: jetzt

  // "YYYY-MM-DDTHH:mm" -> lokale Zeit konstruieren
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (m) {
    const [_, Y, Mo, D, H, Mi] = m.map(Number);
    return new Date(Y, Mo - 1, D, H, Mi); // lokale Zeit; toISOString() macht dann UTC
  }

  // alles andere von Date() parsen lassen
  const dt = new Date(s);
  if (!isNaN(dt)) return dt;

  return new Date(); // Fallback
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  setCORS(res);

  // Preflight
  if (req.method === "OPTIONS") return res.status(200).end();

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  // ---- Minimal-Validierung ----
  const { contactEmail, freeText } = req.body || {};
  if (!contactEmail || !freeText) {
    return res.status(400).json({ error: "contactEmail und freeText sind Pflicht" });
  }

  // ---- Awareness verarbeiten ----
  const awareness = parseAwareness(req.body);

  // ---- Fristen berechnen (UTC) ----
  const due = {
    earlyWarning: toISO(addHours(awareness, 24)),
    incidentNotification: toISO(addHours(awareness, 72)),
    finalReport: toISO(addDays(awareness, 30))
  };

  // ---- Antwort (MVP) ----
  return res.status(200).json({
    intakeId: "demo-" + Date.now(),
    awarenessTime: toISO(awareness),
    due,
    drafts: {
      earlyWarning: { reportType: "EARLY_WARNING" },
      incidentNotification: { reportType: "INCIDENT_NOTIFICATION" },
      finalReport: { reportType: "FINAL_REPORT" }
    }
  });
}

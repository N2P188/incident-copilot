// api/incident-intake.js

// --- CORS erlauben ---
function setCORS(res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  setCORS(res);

  // Preflight von Browsern
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }

  // Heutiger Minimal-Check
  const { contactEmail, freeText } = req.body || {};
  if (!contactEmail || !freeText) {
    return res.status(400).json({ error: "contactEmail und freeText sind Pflicht" });
  }

  // Dummy-Deadlines (wir bauen das später richtig)
  return res.status(200).json({
    intakeId: "demo-" + Date.now(),
    due: {
      earlyWarning: "DUMMY+24h",
      incidentNotification: "DUMMY+72h",
      finalReport: "DUMMY+30d"
    },
    drafts: {
      earlyWarning: { reportType: "EARLY_WARNING" },
      incidentNotification: { reportType: "INCIDENT_NOTIFICATION" },
      finalReport: { reportType: "FINAL_REPORT" }
    }
  });
}

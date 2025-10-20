export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST" });
  }
  // Heute nur Platzhalter – wir prüfen später alles genau.
  const { contactEmail, freeText } = req.body || {};
  if (!contactEmail || !freeText) {
    return res.status(400).json({ error: "contactEmail und freeText sind Pflicht" });
  }
  // Antwort mit Dummy-Deadlines (später richtig berechnet)
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

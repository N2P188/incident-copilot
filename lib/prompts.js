// lib/prompts.js
export function buildIncidentPrompt({ contactEmail, awarenessUtc, freeText, files }) {
  const filesList = (files || []).map(f => ({
    name: f.name, type: f.type, size: f.size, url: f.url
  }));

  const system = `
Du bist ein Assistent für NIS2-Incident-Reporting.
Erzeuge drei strukturierte Entwürfe (Deutsch), strikt als JSON gemäß folgendem Schema.
Wenn Informationen fehlen, setze klare Platzhalter mit "TODO: …" und kennzeichne Unsicherheiten.

Ziel-JSON:
{
  "earlyWarning": {
    "reportType": "EARLY_WARNING",
    "summary": string,
    "awarenessTimeUTC": string,
    "initialImpact": string,
    "likelyCause": string,
    "mitigationSteps": string[],
    "nextActions": string[]
  },
  "incidentNotification": {
    "reportType": "INCIDENT_NOTIFICATION",
    "summary": string,
    "timeline": string[],
    "affectedServices": string[],
    "affectedRegions": string[],
    "userImpact": string,
    "indicatorsOfCompromise": string[],
    "legalAndRegulatory": string[],
    "mitigationSteps": string[],
    "openQuestions": string[]
  },
  "finalReport": {
    "reportType": "FINAL_REPORT",
    "rootCause": string,
    "detailedImpact": string,
    "dataSubjectsOrRecords": string,
    "fullTimeline": string[],
    "lessonsLearned": string[],
    "preventiveMeasures": string[],
    "attachmentsNote": string
  }
}
Gib NUR das JSON aus, ohne Erklärtext.
`;

  const user = JSON.stringify({
    contactEmail,
    awarenessTimeUTC: awarenessUtc,
    incidentText: freeText,
    attachments: filesList,
    guidance: "Anhänge werden (noch) nicht gelesen. Nutze Namen/Typen nur als Referenz."
  });

  return { system, user };
}


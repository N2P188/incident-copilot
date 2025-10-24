// lib/pdf.js
import PDFDocument from "pdfkit";
import path from "path";
import { put } from "@vercel/blob";

// --- Font-Pfad (Source Sans 3 Regular) ---
const FONT_PATH = path.resolve("assets", "SourceSans3-Regular.ttf");

// ============ Kern ============

// Baut ein PDF aus einem Draft und gibt es als Buffer zurück (ohne fs)
export async function renderIncidentPdfBuffer(draft, type) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      margin: 56, // ~2 cm
      info: {
        Title: `NIS2 ${label(type)} – ${draft?.meta?.company ?? ""}`,
        Author: "Incident Copilot",
        Creator: "Incident Copilot (Serverless)",
      },
    });

    // Stream -> Buffer
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    // Schrift
    try { doc.registerFont("SS3", FONT_PATH); } catch (_) {}
    doc.font("SS3");

    // Layout helpers
    const hr = () => {
      const x = doc.page.margins.left;
      const y = doc.y + 2;
      doc
        .moveTo(x, y)
        .lineTo(doc.page.width - doc.page.margins.right, y)
        .lineWidth(0.7)
        .strokeColor("#000")
        .stroke();
      doc.moveDown(0.6);
    };
    const H1 = (t) => { doc.fontSize(22).text(t, { align: "center" }); doc.moveDown(0.4); };
    const H2 = (t) => { doc.moveDown(0.8); doc.fontSize(13).text(String(t).toUpperCase()); doc.moveDown(0.2); };
    const P  = (t) => { doc.fontSize(11).text((t && String(t)) || "–"); };
    const KV = (k, v) => { doc.fontSize(11).text(`${k}: `, { continued: true }); doc.text(v ?? "–"); };

    // Header
    H1("Incident Report – NIS2");
    doc.fontSize(12).text(label(type), { align: "center" });
    doc.moveDown(0.6);
    hr();

    // Metadaten (für alle Meldungen)
    H2("Metadaten");
    KV("Unternehmen", draft?.meta?.company);
    KV("BSI-ID", draft?.meta?.bsiId);
    KV("Sektor/Kategorie", draft?.meta?.sector ?? draft?.meta?.category);
    KV("Essential/Important", draft?.meta?.classification);
    KV("24/7-Kontakt", draft?.meta?.contact);
    KV("Awareness (ISO-8601)", draft?.meta?.awareness);
    KV("Betroffene Mitgliedstaaten", arr(draft?.meta?.memberStates) || draft?.meta?.memberStates);
    KV("Meldetyp", label(type));
    if (draft?.meta?.previousRef) KV("Ref. Vor-Meldung", draft.meta.previousRef);

    // Inhalt je Report-Typ
    if (type === "EARLY_WARNING") {
      section("Kurzbeschreibung", draft?.summary);
      section("Vermutete Ursache", draft?.likelyCause);
      section("Grenzüberschreitende Auswirkungen", draft?.crossBorder);
      section("Unterstützungsbedarf", draft?.support);
    }

    if (type === "INCIDENT_NOTIFICATION") {
      section("Schweregrad & Auswirkungen", draft?.impact ?? draft?.initialImpact);
      table("Indicators of Compromise (IoCs)", draft?.iocs ?? draft?.indicatorsOfCompromise);
      section("Sofortmaßnahmen", draft?.actions ?? draft?.mitigationSteps);
      section("Abhängigkeiten / Lieferkette", draft?.dependencies);
      section("Timeline (erste Punkte)", renderTimeline(draft?.timeline));
    }

    if (type === "FINAL_REPORT") {
      section("Root Cause", draft?.rootCause);
      section("Dauerhafte Maßnahmen", draft?.mitigation ?? draft?.preventiveMeasures);
      table("Indicators of Compromise (IoCs)", draft?.iocs);
      section("Vollständige Timeline (UTC)", renderTimeline(draft?.timeline ?? draft?.fullTimeline));
      section("Lessons Learned", draft?.lessons ?? draft?.lessonsLearned);
      section("Finaler Impact", draft?.finalImpact ?? draft?.detailedImpact);
    }

    H2("Anhänge (optional)");
    P("Log-Auszüge, Forensik-Kurzberichte, Hash-Listen, Screenshots.");

    doc.end();

    function section(title, text) { H2(title); P(text); }
    function table(title, data) {
      if (!data || (Array.isArray(data) && data.length === 0)) return;
      H2(title);
      if (typeof data === "string") { P(data); return; }
      const rows = Array.isArray(data) ? data : [data];
      rows.forEach((row, i) => {
        if (typeof row === "string") { P(`• ${row}`); }
        else Object.entries(row).forEach(([k, v]) => KV(`• ${k}`, String(v ?? "–")));
        if (i < rows.length - 1) doc.moveDown(0.2);
      });
    }
    function renderTimeline(tl) {
      if (!tl) return "–";
      if (typeof tl === "string") return tl;
      if (Array.isArray(tl)) return tl.map(e => typeof e === "string" ? `• ${e}` : `• ${e.time ?? ""} ${e.event ?? ""}`).join("\n");
      return Object.entries(tl).map(([k,v]) => `• ${k}: ${v}`).join("\n");
    }
    function arr(a) { return Array.isArray(a) ? a.join(", ") : a; }
    function label(t) {
      return t === "EARLY_WARNING" ? "Early Warning (24h)"
        : t === "INCIDENT_NOTIFICATION" ? "Incident Notification (72h)"
        : t === "FINAL_REPORT" ? "Final Report (≤ 1 Monat)" : t;
    }
  });
}

// Erzeugt ALLE PDFs und lädt sie zu Vercel Blob hoch – gibt URLs zurück
export async function generateAndUploadPDFs(intakeId, drafts) {
  const out = {};
  // Mapping der Drafts -> Typen + Dateinamen
  const jobs = [
    ["earlyWarning", "EARLY_WARNING", "NIS2_EarlyWarning.pdf"],
    ["incidentNotification", "INCIDENT_NOTIFICATION", "NIS2_IncidentNotification.pdf"],
    ["finalReport", "FINAL_REPORT", "NIS2_FinalReport.pdf"],
  ];

  for (const [key, type, file] of jobs) {
    const draft = drafts?.[key];
    if (!draft) continue;
    // Metadaten für Kopf (falls fehlen) befüllen
    draft.meta = draft.meta || {};
    // Upload
    const buf = await renderIncidentPdfBuffer(draft, type);
    const path = `${intakeId}/${file}`;
    const { url, pathname, size } = await put(path, buf, {
      access: "public",
      contentType: "application/pdf",
    });
    out[key] = { url, blobPath: pathname, size };
  }
  return out;
}


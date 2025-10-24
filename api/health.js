// api/health.js
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // Prüfen, ob die Fontdatei im Projekt vorhanden ist:
  const fontPath = path.resolve("assets", "SourceSans3-Regular.ttf");
  const fontExists = fs.existsSync(fontPath);

  // Optional: weitere Checks (später für KI oder Blob)
  const environment = {
    openai: !!process.env.OPENAI_API_KEY,
    blob: !!process.env.BLOB_READ_WRITE_TOKEN
  };

  // Antwort im JSON-Format
  return new Response(JSON.stringify({
    ok: true,
    assets: {
      sourceSans3Regular: fontExists,
      path: fontPath
    },
    env: environment
  }), {
    headers: { "content-type": "application/json" }
  });
}


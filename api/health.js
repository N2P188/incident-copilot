// api/health.js
import fs from "fs";
import path from "path";

export default async function handler(req) {
  // --- Font-Check robust (kein Crash, wenn Datei fehlt) ---
  const fontPath = path.resolve("assets", "SourceSans3-Regular.ttf");
  let fontExists = false;
  try {
    const st = fs.statSync(fontPath);
    fontExists = st.isFile();
  } catch {
    fontExists = false;
  }

  // --- Env-Checks (nur Ja/Nein, keine Secrets leaken) ---
  const env = {
    openai: Boolean(process.env.OPENAI_API_KEY),
    blob: Boolean(process.env.BLOB_READ_WRITE_TOKEN),
    node: process.version
  };

  // --- Antwort ---
  const body = {
    ok: true,
    env,
    assets: {
      fontPath,
      sourceSans3Regular: fontExists
    }
  };

  return new Response(JSON.stringify(body, null, 2), {
    status: 200,
    headers: { "content-type": "application/json; charset=utf-8" }
  });
}

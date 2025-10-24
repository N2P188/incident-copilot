// api/health.js
import fs from "fs";
import path from "path";

export default async function handler(req, res) {
  // Pfad zur Schrift prüfen
  const fontPath = path.resolve("assets", "SourceSans3-Regular.ttf");
  const fontExists = fs.existsSync(fontPath);

  // Check auf OpenAI Key
  const hasOpenAI = !!process.env.OPENAI_API_KEY;

  // Antwort zusammenstellen
  return new Response(JSON.stringify({
    ok: true,
    hasOpenAI,
    assets: {
      sourceSans3Regular: fontExists,
      path: fontPath
    }
  }), {
    headers: { "content-type": "application/json" }
  });
}

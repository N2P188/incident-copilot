// lib/llm.js
import OpenAI from "openai";

export async function askLLMAsJson({ model = "gpt-4o-mini", system, user }) {
  // Wenn kein Key vorhanden, werfen wir bewusst einen Fehler,
  // den die API später abfängt und saubere Fallback-Drafts liefert.
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY missing");
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const resp = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: system },
      { role: "user", content: user }
    ],
    temperature: 0.2
  });

  const txt = resp.choices?.[0]?.message?.content || "{}";
  try { return JSON.parse(txt); } catch { return { _raw: txt }; }
}


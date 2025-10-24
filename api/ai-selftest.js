import OpenAI from "openai";

export default async function handler(_req, res) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(200).json({ ok: false, reason: "NO_KEY" });
    }
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    // Mini-Request (billig & schnell)
    const r = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: "Antwort nur mit: OK" }],
      temperature: 0
    });
    const content = r.choices?.[0]?.message?.content || "";
    return res.status(200).json({ ok: true, model: r.model, content });
  } catch (e) {
    return res.status(200).json({ ok: false, error: String(e?.message || e) });
  }
}


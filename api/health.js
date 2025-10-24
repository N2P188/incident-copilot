import fs from "fs";
import path from "path";
export default function handler(_req, res) {
  res.status(200).json({
    ok: true,
    hasOpenAI: !!process.env.OPENAI_API_KEY
  });
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST")   return res.status(405).json({ error: "Method not allowed" });

  const expected = process.env.RADAR_PASSWORD;
  if (!expected) return res.status(500).json({ error: "Auth not configured" });

  const body = typeof req.body === "string" ? JSON.parse(req.body) : (req.body || {});
  const { password } = body;

  if (password === expected) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false });
}

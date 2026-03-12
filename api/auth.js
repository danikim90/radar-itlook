export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "POST");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const { senha } = req.body;
  if (senha === process.env.SENHA_RADAR) {
    return res.status(200).json({ ok: true });
  }
  return res.status(401).json({ ok: false });
}

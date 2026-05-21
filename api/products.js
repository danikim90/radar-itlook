import { BigQuery } from "@google-cloud/bigquery";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { dias = "30", de, ate } = req.query;
  const useRange = de && ate && DATE_RE.test(de) && DATE_RE.test(ate) && de <= ate;

  const SELECT = `
    SELECT
      produto,
      SUM(impressoes)      AS impressoes,
      SUM(cliques)         AS cliques,
      SUM(carrinho)        AS carrinho,
      SUM(compras)         AS compras,
      SUM(sessoes)         AS sessoes,
      AVG(ctr)             AS ctr,
      AVG(ctr_sessao)      AS ctr_sessao,
      AVG(vpm)             AS vpm,
      AVG(add_rate)        AS add_rate,
      AVG(conversion_rate) AS conversion_rate
    FROM \`itlook-analytics.analytics_395902084.vw_radar_completo\`
  `;

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const bigquery = new BigQuery({ projectId: "itlook-analytics", credentials });

    let query, params;
    if (useRange) {
      query  = SELECT + `WHERE data BETWEEN @de AND @ate GROUP BY produto ORDER BY impressoes DESC`;
      params = { de, ate };
    } else {
      const diasNum = Math.min(Math.max(parseInt(dias) || 30, 7), 90);
      query  = SELECT + `WHERE data >= DATE_SUB(CURRENT_DATE(), INTERVAL @dias DAY) GROUP BY produto ORDER BY impressoes DESC`;
      params = { dias: diasNum };
    }

    const [rows] = await bigquery.query({ query, params });
    res.status(200).json({ products: rows });
  } catch (error) {
    console.error("Erro BigQuery:", error);
    res.status(500).json({ error: "Erro ao buscar dados", details: error.message });
  }
}

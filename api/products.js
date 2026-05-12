import { BigQuery } from "@google-cloud/bigquery";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { dias = "30" } = req.query;
  const diasNum = Math.min(Math.max(parseInt(dias) || 30, 7), 90);

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const bigquery = new BigQuery({
      projectId: "itlook-analytics",
      credentials,
    });

    const query = `
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
      WHERE data >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL @dias DAY))
      GROUP BY produto
      ORDER BY impressoes DESC
      LIMIT 200
    `;

    const options = {
      query,
      params: { dias: diasNum },
    };

    const [rows] = await bigquery.query(options);
    res.status(200).json({ products: rows });
  } catch (error) {
    console.error("Erro BigQuery:", error);
    res.status(500).json({ error: "Erro ao buscar dados", details: error.message });
  }
}

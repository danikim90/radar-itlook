import { BigQuery } from "@google-cloud/bigquery";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);

    const bigquery = new BigQuery({
      projectId: "itlook-analytics",
      credentials,
    });

    const query = `
      SELECT
        produto,
        impressoes,
        cliques,
        carrinho,
        compras,
        ctr,
        add_rate,
        conversion_rate,
        status_inteligente
      FROM \`itlook-analytics.analytics_395902084.vw_produtos_inteligente\`
      WHERE produto IS NOT NULL
      ORDER BY impressoes DESC
      LIMIT 200
    `;

    const [rows] = await bigquery.query({ query });

    res.status(200).json({ products: rows });
  } catch (error) {
    console.error("Erro BigQuery:", error);
    res.status(500).json({ error: "Erro ao buscar dados", details: error.message });
  }
}

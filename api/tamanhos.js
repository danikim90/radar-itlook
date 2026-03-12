import { BigQuery } from "@google-cloud/bigquery";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
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
        tamanho,
        qtd_vendida
      FROM \`itlook-analytics.analytics_395902084.vw_vendas_por_tamanho\`
      WHERE tamanho IS NOT NULL AND produto IS NOT NULL
      ORDER BY produto, qtd_vendida DESC
    `;

    const [rows] = await bigquery.query({ query });

    // Agrupa por nome do produto (lowercase trim para bater com o frontend)
    const tamanhoMap = {};
    for (const row of rows) {
      const key = row.produto.toLowerCase().trim();
      if (!tamanhoMap[key]) tamanhoMap[key] = [];
      tamanhoMap[key].push({ tamanho: row.tamanho, qtd: Number(row.qtd_vendida) });
    }

    res.status(200).json({ tamanhoMap });
  } catch (error) {
    console.error("Erro BigQuery tamanhos:", error);
    res.status(500).json({ error: "Erro ao buscar tamanhos", details: error.message });
  }
}

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
        item_id,
        tamanho,
        qtd_vendida
      FROM \`itlook-analytics.analytics_395902084.vw_vendas_por_tamanho\`
      WHERE tamanho IS NOT NULL
      ORDER BY item_id, qtd_vendida DESC
    `;

    const [rows] = await bigquery.query({ query });

    // Agrupa por item_id: { "123": [ { tamanho: "M", qtd_vendida: 12 }, ... ] }
    const tamanhoMap = {};
    for (const row of rows) {
      const id = String(row.item_id);
      if (!tamanhoMap[id]) tamanhoMap[id] = [];
      tamanhoMap[id].push({ tamanho: row.tamanho, qtd: Number(row.qtd_vendida) });
    }

    res.status(200).json({ tamanhoMap });
  } catch (error) {
    console.error("Erro BigQuery tamanhos:", error);
    res.status(500).json({ error: "Erro ao buscar tamanhos", details: error.message });
  }
}

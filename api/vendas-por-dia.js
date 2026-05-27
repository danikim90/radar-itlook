import { BigQuery } from "@google-cloud/bigquery";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { produto, dias = "365" } = req.query;
  if (!produto) return res.status(400).json({ error: "Parâmetro 'produto' obrigatório" });

  const diasNum = Math.min(Math.max(parseInt(dias) || 365, 1), 730);

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const bigquery = new BigQuery({ projectId: "itlook-analytics", credentials });

    // Mesmo padrão de tamanhos-vendidos.js: @dias como INT64 + FORMAT_DATE/DATE_SUB no SQL
    const query = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', PARSE_DATE('%Y%m%d', event_date)) AS data,
        COUNT(*) AS vendas_dia
      FROM \`itlook-analytics.analytics_395902084.events_*\`
      CROSS JOIN UNNEST(items) AS item
      WHERE event_name = 'purchase'
        AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL @dias DAY))
        AND LOWER(TRIM(REGEXP_REPLACE(item.item_name, r'\\s*\\([^)]*\\)\\s*$', ''))) = LOWER(TRIM(@produto))
      GROUP BY data
      ORDER BY data
    `;

    const [rows] = await bigquery.query({ query, params: { dias: diasNum, produto } });

    // Preenche todos os dias (sem gaps) e calcula acumulado
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(today);
    startDate.setDate(startDate.getDate() - diasNum);

    const dailyMap = {};
    rows.forEach(r => { dailyMap[r.data] = Number(r.vendas_dia); });

    const result = [];
    let cumulative = 0;
    const cursor = new Date(startDate);

    while (cursor <= today) {
      const dateStr = cursor.toISOString().slice(0, 10);
      cumulative += dailyMap[dateStr] || 0;
      result.push({ data: dateStr, vendas_acumuladas: cumulative });
      cursor.setDate(cursor.getDate() + 1);
    }

    res.status(200).json(result);
  } catch (error) {
    console.error("[vendas-por-dia] BigQuery error:", error);
    res.status(500).json({ error: "Erro ao buscar dados", details: error.message });
  }
}

import { BigQuery } from "@google-cloud/bigquery";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { produto, dias = "30", de, ate } = req.query;
  if (!produto) return res.status(400).json({ error: "Parâmetro 'produto' obrigatório" });

  const useRange = de && ate && DATE_RE.test(de) && DATE_RE.test(ate) && de <= ate;
  const diasNum  = Math.min(Math.max(parseInt(dias) || 30, 7), 90);

  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const bigquery = new BigQuery({ projectId: "itlook-analytics", credentials });

    const query = useRange ? `
      SELECT item.item_variant AS tamanho, COUNT(*) AS qtd
      FROM \`itlook-analytics.analytics_395902084.events_*\`
      CROSS JOIN UNNEST(items) AS item
      WHERE event_name = 'purchase'
        AND _TABLE_SUFFIX >= REPLACE(@de, '-', '')
        AND _TABLE_SUFFIX <= REPLACE(@ate, '-', '')
        AND LOWER(TRIM(REGEXP_REPLACE(item.item_name, r'\\s*\\([^)]*\\)\\s*$', ''))) = LOWER(TRIM(@produto))
        AND item.item_variant IS NOT NULL AND item.item_variant != ''
      GROUP BY tamanho ORDER BY qtd DESC
    ` : `
      SELECT item.item_variant AS tamanho, COUNT(*) AS qtd
      FROM \`itlook-analytics.analytics_395902084.events_*\`
      CROSS JOIN UNNEST(items) AS item
      WHERE event_name = 'purchase'
        AND _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL @dias DAY))
        AND LOWER(TRIM(REGEXP_REPLACE(item.item_name, r'\\s*\\([^)]*\\)\\s*$', ''))) = LOWER(TRIM(@produto))
        AND item.item_variant IS NOT NULL AND item.item_variant != ''
      GROUP BY tamanho ORDER BY qtd DESC
    `;

    const params = useRange ? { de, ate, produto } : { dias: diasNum, produto };
    const [rows] = await bigquery.query({ query, params });
    res.status(200).json(rows.map(r => ({ tamanho: r.tamanho, qtd: Number(r.qtd) })));
  } catch (error) {
    console.error("Erro BigQuery tamanhos-vendidos:", error);
    res.status(500).json({ error: "Erro ao buscar tamanhos", details: error.message });
  }
}

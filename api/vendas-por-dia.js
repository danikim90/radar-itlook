import { BigQuery } from "@google-cloud/bigquery";

async function fetchWithRetry(url, options, retries = 3) {
  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(url, options);
    if (res.status !== 429) return res;
    const wait = parseInt(res.headers.get("Retry-After") || "2") * 1000;
    await new Promise(r => setTimeout(r, wait));
  }
  throw new Error("Rate limit: max retries reached");
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const { produto } = req.query;
  if (!produto) return res.status(400).json({ error: "Parâmetro 'produto' obrigatório" });

  const STORE_ID     = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;
  const nsHeaders = {
    Authentication: `bearer ${ACCESS_TOKEN}`,
    "User-Agent": "ITLook Radar (contato@itlook.com.br)",
    "Content-Type": "application/json",
  };

  // 1. Busca data de criação/publicação na Nuvemshop
  const normalizado = produto.toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
  let dataInicioSuffix = null; // YYYYMMDD para comparar com _TABLE_SUFFIX do BQ

  try {
    const searchRes = await fetchWithRetry(
      `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?q=${encodeURIComponent(normalizado)}&fields=name,published_at,created_at&per_page=20`,
      { headers: nsHeaders }
    );
    const found = await searchRes.json();

    if (Array.isArray(found)) {
      for (const p of found) {
        const nome = (p.name?.pt || p.name?.en || p.name?.es || "")
          .toLowerCase().replace(/\s*\([^)]*\)\s*$/, "").trim();
        if (nome === normalizado) {
          const raw = p.published_at ?? p.created_at;
          if (raw != null) {
            const d = typeof raw === "number" ? new Date(raw * 1000) : new Date(raw);
            if (!isNaN(d.getTime())) {
              dataInicioSuffix = d.toISOString().slice(0, 10).replace(/-/g, "");
            }
          }
          break;
        }
      }
    }
  } catch (e) {
    console.error("[vendas-por-dia] Nuvemshop search error:", e.message);
  }

  // Fallback: 1 ano atrás
  if (!dataInicioSuffix) {
    const fallback = new Date();
    fallback.setFullYear(fallback.getFullYear() - 1);
    dataInicioSuffix = fallback.toISOString().slice(0, 10).replace(/-/g, "");
    console.warn(`[vendas-por-dia] "${produto}" não encontrado no Nuvemshop — usando fallback 1 ano.`);
  }

  // 2. Busca vendas diárias no BigQuery desde a data de criação
  try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const bigquery = new BigQuery({ projectId: "itlook-analytics", credentials });

    const query = `
      SELECT
        FORMAT_DATE('%Y-%m-%d', PARSE_DATE('%Y%m%d', _TABLE_SUFFIX)) AS data,
        COUNT(*) AS vendas_dia
      FROM \`itlook-analytics.analytics_395902084.events_*\`
      CROSS JOIN UNNEST(items) AS item
      WHERE event_name = 'purchase'
        AND _TABLE_SUFFIX >= @data_inicio
        AND LOWER(TRIM(REGEXP_REPLACE(item.item_name, r'\\s*\\([^)]*\\)\\s*$', ''))) = LOWER(TRIM(@produto))
      GROUP BY data
      ORDER BY data
    `;

    const [rows] = await bigquery.query({
      query,
      params: { data_inicio: dataInicioSuffix, produto },
    });

    // 3. Preenche todos os dias (sem gaps) e calcula acumulado
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const startDate = new Date(
      Number(dataInicioSuffix.slice(0, 4)),
      Number(dataInicioSuffix.slice(4, 6)) - 1,
      Number(dataInicioSuffix.slice(6, 8))
    );

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

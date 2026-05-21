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

  const STORE_ID = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;

  const headers = {
    Authentication: `bearer ${ACCESS_TOKEN}`,
    "User-Agent": "ITLook Radar (contato@itlook.com.br)",
    "Content-Type": "application/json",
  };

  try {
    // Busca todas as categorias pelo endpoint dedicado
    const catsRes = await fetchWithRetry(
      `https://api.nuvemshop.com.br/v1/${STORE_ID}/categories?per_page=200`,
      { headers }
    );
    const allCats = await catsRes.json();
    const catIdToName = {};
    if (Array.isArray(allCats)) {
      allCats.forEach((c) => {
        const nome = c.name?.pt || c.name?.en || c.name?.es || "";
        if (nome && !nome.toLowerCase().includes("sale")) {
          catIdToName[c.id] = nome;
        }
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    function parseNSDate(d) {
      if (d === null || d === undefined) return null;
      if (typeof d === "number") return new Date(d * 1000);
      return new Date(d);
    }

    // Loop principal: estoque e categorias (campos originais, sem alterar)
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetchWithRetry(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,variants,categories&per_page=200&page=${page}`,
        { headers }
      );
      const products = await response.json();
      if (!Array.isArray(products) || !products.length) { hasMore = false; break; }
      allProducts = [...allProducts, ...products];
      page++;
      if (products.length < 200) hasMore = false;
    }

    // Loop separado: datas de ativação (published_at / created_at)
    let datesRaw = [];
    let datesPage = 1;
    let datesMore = true;

    while (datesMore) {
      const datesRes = await fetchWithRetry(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?per_page=200&page=${datesPage}`,
        { headers }
      );
      const datesBatch = await datesRes.json();
      if (!Array.isArray(datesBatch) || !datesBatch.length) { datesMore = false; break; }
      datesRaw.push(...datesBatch);
      datesPage++;
      if (datesBatch.length < 200) datesMore = false;
    }

    const estoqueMap   = {};
    const categoriaMap = {};
    const categoriasMap = {};
    const diasAtivoMap  = {};

    allProducts.forEach((product) => {
      const nome = (product.name?.pt || product.name?.en || product.name?.es || "").toLowerCase().trim();
      if (!nome) return;

      // Estoque total somando todas as variantes
      const estoqueTotal = (product.variants || []).reduce((acc, v) => {
        const s = v.stock;
        return acc + (typeof s === "number" ? s : typeof s === "object" ? (s?.total ?? 0) : 0);
      }, 0);
      estoqueMap[nome] = estoqueTotal;

      // Todas as categorias do produto
      const cats = (product.categories || []).map((c) => {
        return catIdToName[c.id] || c.name?.pt || c.name?.en || c.name?.es || "";
      }).filter((c) => c && !c.toLowerCase().includes("sale"));

      categoriaMap[nome]  = cats[0] || "Sem categoria";
      categoriasMap[nome] = cats;
    });

    // Processa datas de ativação a partir do loop separado
    datesRaw.forEach((product) => {
      const nome = (product.name?.pt || product.name?.en || product.name?.es || "").toLowerCase().trim();
      if (!nome) return;

      const pubDate = parseNSDate(product.published_at);
      const creDate = parseNSDate(product.created_at);
      const refDate = pubDate || creDate;
      const campo   = pubDate ? "published_at" : "created_at";

      if (refDate && !isNaN(refDate.getTime())) {
        const dias = Math.max(0, Math.floor((today - refDate) / 86400000));
        diasAtivoMap[nome] = dias;
        console.log(`[diasAtivo] "${nome}": ${dias} dias (via ${campo})`);
      }
    });

    const allCategories = [...new Set(Object.values(categoriasMap).flat())].filter(Boolean).sort();

    res.status(200).json({
      estoqueMap,
      categoriaMap,
      categoriasMap,
      allCategories,
      diasAtivoMap,
      total: allProducts.length,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

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
    const catsRes = await fetch(
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

    // Busca todos os produtos com paginação
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,variants,categories&per_page=200&page=${page}`,
        { headers }
      );
      const products = await response.json();
      if (!Array.isArray(products) || !products.length) { hasMore = false; break; }
      allProducts = [...allProducts, ...products];
      page++;
      if (products.length < 200) hasMore = false;
    }

    const estoqueMap = {};
    const categoriaMap = {};   // primeira categoria de cada produto (para display/agrupamento)
    const categoriasMap = {};  // todas as categorias de cada produto (para filtro)

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

    // Todas as categorias únicas que aparecem em qualquer produto
    const allCategories = [...new Set(Object.values(categoriasMap).flat())].filter(Boolean).sort();

    res.status(200).json({ estoqueMap, categoriaMap, categoriasMap, allCategories, total: allProducts.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

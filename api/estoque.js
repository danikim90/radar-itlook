export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "https://radar-itlook.vercel.app");
  res.setHeader("Access-Control-Allow-Methods", "GET");

  const STORE_ID = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;

  try {
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,variants,categories&per_page=200&page=${page}`,
        {
          headers: {
            Authentication: `bearer ${ACCESS_TOKEN}`,
            "User-Agent": "ITLook Radar (contato@itlook.com.br)",
            "Content-Type": "application/json",
          },
        }
      );

      const products = await response.json();
      if (!Array.isArray(products) || !products.length) { hasMore = false; break; }
      allProducts = [...allProducts, ...products];
      page++;
      if (products.length < 200) hasMore = false;
    }

    const estoqueMap = {};
    const categoriaMap = {};

    allProducts.forEach((product) => {
      const nome = product.name?.pt?.toLowerCase().trim();
      if (!nome) return;

      // Estoque total somando todas as variantes
      const estoqueTotal = (product.variants || []).reduce((acc, v) => {
        return acc + (typeof v.stock === "number" ? v.stock : 0);
      }, 0);
      estoqueMap[nome] = estoqueTotal;

      // Categoria principal (primeira que não for "sale")
      const cats = (product.categories || [])
        .map((c) => c.name?.pt || c.name?.en || "")
        .filter((c) => c && !c.toLowerCase().includes("sale"));
      categoriaMap[nome] = cats[0] || "Sem categoria";
    });

    res.status(200).json({ estoqueMap, categoriaMap, total: allProducts.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

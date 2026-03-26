export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://radar-itlook.vercel.app');

  const STORE_ID = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;

  try {
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,images,variants&per_page=200&page=${page}&published=true`,
        {
          headers: {
            'Authentication': `bearer ${ACCESS_TOKEN}`,
            'User-Agent': 'ITLook Radar (contato@itlook.com.br)',
            'Content-Type': 'application/json'
          }
        }
      );
      const products = await response.json();
      if (!Array.isArray(products) || products.length === 0) { hasMore = false; break; }
      allProducts = [...allProducts, ...products];
      page++;
      if (products.length < 200) hasMore = false;
    }

    const produtos = [];

    for (const product of allProducts) {
      if (!Array.isArray(product.variants) || product.variants.length === 0) continue;

      const gerenciados = product.variants.filter(v => v.stock_management);
      if (gerenciados.length === 0) continue;

      const variantes = gerenciados.map(v => ({
        id: v.id,
        nome: v.values?.map(val => val.pt || val.en).join(' / ') || String(v.id),
        stock: v.stock,
        zerado: v.stock !== null && v.stock <= 0
      }));

      const zerados = variantes.filter(v => v.zerado).map(v => v.nome);
      if (zerados.length === 0) continue;

      produtos.push({
        id: product.id,
        name: product.name?.pt || product.name?.en || String(product.id),
        image: product.images?.[0]?.src || null,
        variantes,
        zerados
      });
    }

    // Mais crítico primeiro (mais tamanhos zerados)
    produtos.sort((a, b) => b.zerados.length - a.zerados.length);

    res.status(200).json({ produtos, total: produtos.length });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

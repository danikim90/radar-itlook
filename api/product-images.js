export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  const STORE_ID = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;
  
  try {
    let allProducts = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const response = await fetch(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,images,variants&per_page=200&page=${page}`,
        {
          headers: {
            'Authentication': `bearer ${ACCESS_TOKEN}`,
            'User-Agent': 'ITLook Radar (contato@itlook.com.br)',
            'Content-Type': 'application/json'
          }
        }
      );
      
      const products = await response.json();
      if (!products.length) { hasMore = false; break; }
      
      allProducts = [...allProducts, ...products];
      page++;
      if (products.length < 200) hasMore = false;
    }
    
    const imageMap = {};
    
    allProducts.forEach(product => {
      const imageUrl = product.images?.[0]?.src || null;
      
      const nomeLimpo = product.name?.pt?.toLowerCase().trim();
      if (nomeLimpo) imageMap[nomeLimpo] = imageUrl;
      
      product.variants?.forEach(variant => {
        if (variant.sku) imageMap[variant.sku.toLowerCase()] = imageUrl;
      });
    });
    
    res.status(200).json({ imageMap, total: allProducts.length });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

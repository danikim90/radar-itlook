import { Redis } from '@upstash/redis';
import { Resend } from 'resend';

const KV_KEY = 'estoque:snapshot';
const EMAIL_TO = 'itlookoficial@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://radar-itlook.vercel.app');

  const STORE_ID = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;

  try {
    // 1. Buscar todos os produtos ativos com variações
    let allProducts = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const response = await fetch(
        `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,images,variants,categories&per_page=200&page=${page}&published=true`,
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

    // 2. Ignorar produtos da categoria SALE
    const isSale = p => p.categories?.some(
      c => c.name?.pt?.toLowerCase() === 'sale' || c.name?.en?.toLowerCase() === 'sale'
    );

    // 3. Identificar variações com estoque zerado (excluindo SALE)
    // snapshot = { [productId]: { zeroVariantIds: [...] } }
    const currentZero = {};

    for (const product of allProducts) {
      if (isSale(product)) continue;
      if (!Array.isArray(product.variants)) continue;
      const zeroVariants = product.variants.filter(
        v => v.stock_management && v.stock !== null && v.stock <= 0
      );
      if (zeroVariants.length > 0) {
        currentZero[product.id] = {
          name: product.name?.pt || product.name?.en || String(product.id),
          image: product.images?.[0]?.src || null,
          zeroVariantIds: zeroVariants.map(v => v.id)
        };
      }
    }

    // 3. Comparar com snapshot anterior no Redis
    const redis = new Redis({
      url: process.env.KV_REST_API_URL,
      token: process.env.KV_REST_API_TOKEN,
    });

    if (req.query?.reset === 'true') {
      await redis.del(KV_KEY);
    }

    const previousSnapshot = (await redis.get(KV_KEY)) || {};

    // Detectar produtos/variações que ZERARAM desde a última checagem
    const novosZerados = [];

    for (const [productId, data] of Object.entries(currentZero)) {
      const prevIds = previousSnapshot[productId]?.zeroVariantIds || [];
      const novosIds = data.zeroVariantIds.filter(id => !prevIds.includes(id));
      if (novosIds.length > 0) {
        const product = allProducts.find(p => p.id === Number(productId));
        const novasVariacoes = product.variants
          .filter(v => novosIds.includes(v.id))
          .map(v => {
            const vals = v.values;
            const ultimo = vals?.[vals.length - 1];
            return ultimo ? (ultimo.pt || ultimo.en) : String(v.id);
          });
        novosZerados.push({ name: data.name, variacoes: novasVariacoes });
      }
    }

    // 4. Enviar e-mail se houver novos zerados
    if (novosZerados.length > 0) {
      const resend = new Resend(process.env.RESEND_API_KEY);

      const linhas = novosZerados.map(p =>
        `<tr>
          <td style="padding:10px 16px;border-bottom:1px solid #eee;font-size:14px;color:#1a1a1a;">${p.name}</td>
          <td style="padding:10px 16px;border-bottom:1px solid #eee;font-size:14px;color:#555;">${p.variacoes.join(' · ')}</td>
        </tr>`
      ).join('');

      await resend.emails.send({
        from: 'Radar ITLook <onboarding@resend.dev>',
        to: EMAIL_TO,
        subject: `Estoque zerado: ${novosZerados.length} produto(s)`,
        html: `
          <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 0;">
            <p style="font-size:13px;font-weight:600;letter-spacing:2px;color:#888;margin:0 0 24px;">RADAR ITLOOK · ALERTA DE ESTOQUE</p>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #eee;">
              <thead>
                <tr style="background:#f7f6f3;">
                  <th style="padding:10px 16px;text-align:left;font-size:11px;color:#888;font-weight:600;letter-spacing:1px;border-bottom:1px solid #eee;">PRODUTO</th>
                  <th style="padding:10px 16px;text-align:left;font-size:11px;color:#888;font-weight:600;letter-spacing:1px;border-bottom:1px solid #eee;">TAMANHOS ZERADOS</th>
                </tr>
              </thead>
              <tbody>${linhas}</tbody>
            </table>
            <p style="font-size:11px;color:#bbb;margin:24px 0 0;">Gerado automaticamente · ${new Date().toLocaleDateString('pt-BR')}</p>
          </div>
        `
      });
    }

    // 5. Salvar novo snapshot
    const novoSnapshot = {};
    for (const [productId, data] of Object.entries(currentZero)) {
      novoSnapshot[productId] = { zeroVariantIds: data.zeroVariantIds };
    }
    await redis.set(KV_KEY, novoSnapshot);

    res.status(200).json({
      produtosZeradosAgora: Object.keys(currentZero).length,
      novosZerados: novosZerados.length,
      emailEnviado: novosZerados.length > 0
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
}

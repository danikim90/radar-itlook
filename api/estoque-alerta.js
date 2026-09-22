import { Redis } from '@upstash/redis';
import { Resend } from 'resend';

const KV_KEY = 'estoque:snapshot';
const EMAIL_TO = process.env.ALERT_EMAIL_TO || 'itlookoficial@gmail.com';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://radar-itlook.vercel.app');

  const STORE_ID = process.env.NUVEMSHOP_STORE_ID;
  const ACCESS_TOKEN = process.env.NUVEMSHOP_ACCESS_TOKEN;

  try {
    // 1. Buscar todos os produtos ativos com variações
    let allProducts = [];
    let page = 1;
    let hasMore = true;
    // Se a Nuvemshop falhar, não temos dado confiável: não mexe no snapshot nem manda alerta
    let falhaNuvemshop = null;

    while (hasMore) {
      let response, products;
      try {
        response = await fetch(
          `https://api.nuvemshop.com.br/v1/${STORE_ID}/products?fields=id,name,images,variants,categories&per_page=200&page=${page}&published=true`,
          {
            headers: {
              'Authentication': `bearer ${ACCESS_TOKEN}`,
              'User-Agent': 'ITLook Radar (contato@itlook.com.br)',
              'Content-Type': 'application/json'
            },
            signal: AbortSignal.timeout(20000)
          }
        );
        // 404 depois da página 1 = passou da última página ("Last page is N"), fim normal da lista
        if (response.status === 404 && page > 1) { hasMore = false; break; }
        products = await response.json();
      } catch (fetchError) {
        falhaNuvemshop = `página ${page}: ${response ? `HTTP ${response.status} ` : ''}${fetchError.name === 'TimeoutError' ? 'timeout após 20s' : fetchError.message}`;
        break;
      }
      if (!response.ok || !Array.isArray(products) || (page === 1 && products.length === 0)) {
        falhaNuvemshop = `página ${page}: HTTP ${response.status} ${JSON.stringify(products).slice(0, 300)}`;
        break;
      }
      if (!Array.isArray(products) || products.length === 0) { hasMore = false; break; }
      allProducts = [...allProducts, ...products];
      page++;
      if (products.length < 200) hasMore = false;
    }

    if (falhaNuvemshop) {
      console.error('Falha ao buscar produtos na Nuvemshop, snapshot mantido:', falhaNuvemshop);
      let avisoEnviado = false;
      try {
        const resend = new Resend(process.env.RESEND_API_KEY);
        const { error } = await resend.emails.send({
          from: 'Radar ITLook <onboarding@resend.dev>',
          to: EMAIL_TO,
          subject: 'Radar não rodou hoje — Nuvemshop fora do ar',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:32px 0;">
              <p style="font-size:13px;font-weight:600;letter-spacing:2px;color:#888;margin:0 0 24px;">RADAR ITLOOK · ALERTA DE ESTOQUE</p>
              <p style="font-size:14px;color:#1a1a1a;">O alerta de estoque zerado não rodou hoje porque a Nuvemshop não respondeu corretamente. A base de comparação foi mantida, e amanhã a checagem volta ao normal.</p>
              <p style="font-size:12px;color:#888;">${falhaNuvemshop.replace(/</g, '&lt;')}</p>
              <p style="font-size:11px;color:#bbb;margin:24px 0 0;">Gerado automaticamente · ${new Date().toLocaleDateString('pt-BR')}</p>
            </div>
          `
        });
        if (error) throw new Error(error.message);
        avisoEnviado = true;
      } catch (avisoError) {
        console.error('Falha ao enviar e-mail de aviso da Nuvemshop:', avisoError);
      }
      return res.status(502).json({ error: `Nuvemshop: ${falhaNuvemshop}`, snapshotMantido: true, avisoEnviado });
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

      try {
        const { error } = await resend.emails.send({
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
        // Resend v6 não lança exceção em falha de envio, devolve { error }: sem e-mail entregue, não avança o snapshot
        if (error) throw new Error(`${error.statusCode ?? ''} ${error.name}: ${error.message}`.trim());
      } catch (emailError) {
        console.error('Falha ao enviar e-mail de alerta de estoque:', emailError);
        throw new Error(`Falha ao enviar e-mail: ${emailError.message}`);
      }
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

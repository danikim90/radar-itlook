# Radar IT Look — Contexto do Projeto

> Documentação gerada a partir do histórico de conversas. Serve como referência para o Claude Code e para qualquer IA que precise de contexto do projeto.

---

## Visão geral

**URL em produção:** https://radar-itlook.vercel.app  
**Repositório:** https://github.com/danikim90/radar-itlook  
**Plataforma de loja:** Nuvemshop  

**Stack:**
- Frontend: HTML + JS vanilla (`index.html`)
- Backend: funções serverless em `/api/` (Node.js)
- Deploy: Vercel
- Dados de performance: BigQuery (exportação nativa GA4)
- Dados de estoque/catálogo: Nuvemshop API

---

## Estrutura de arquivos

```
radar-itlook/
├── index.html              # Frontend principal
├── vercel.json             # Config de deploy
├── package.json
└── api/
    ├── products.js         # Query BigQuery → métricas de performance
    ├── product-images.js   # Nuvemshop → imagens, categorias, filtro "sale"
    ├── estoque.js          # Nuvemshop → estoque real + categoria por produto
    ├── estoque-status.js   # Sistema de alerta de estoque
    ├── estoque-alerta.js   # Template de e-mail de alerta
    ├── tamanhos.js         # Busca tamanhos (autenticação segura)
    └── auth.js             # Auth + CORS restrito ao domínio Vercel
```

---

## BigQuery

**Projeto:** `itlook-analytics`  
**Dataset:** `analytics_395902084`  
**Tabelas brutas:** 84 tabelas `events_YYYYMMDD` (exportação nativa GA4)

**Views criadas:**
- `vw_produtos_inteligente` — view original com métricas estáticas
- `vw_radar_completo` — view atualizada com suporte a filtro de período dinâmico

**Colunas da `vw_radar_completo`:**
`data, produto, impressoes, cliques, carrinho, compras, sessoes, ctr, ctr_sessao, vpm, add_rate, conversion_rate`

---

## Variáveis de ambiente (Vercel)

| Variável | Descrição |
|---|---|
| `GOOGLE_CREDENTIALS` | JSON da service account do BigQuery |
| `NUVEMSHOP_STORE_ID` | ID da loja na Nuvemshop |
| `NUVEMSHOP_ACCESS_TOKEN` | Token de acesso à API da Nuvemshop |

---

## Métricas do radar

| Coluna | Descrição |
|---|---|
| Score | Score composto 0–100 (ver fórmula abaixo) |
| Estoque | Estoque real puxado da Nuvemshop (soma de variantes) |
| Dias Ativação | Dias desde `published_at` (fallback: `created_at`) via Nuvemshop |
| CTR% | Cliques / Impressões × 100 |
| CTR/Sessão | Cliques / Sessões × 100 |
| VPM | Vendas por Mil Impressões |
| Impressões | Total de `view_item` no GA4 |
| Cliques | Total de `select_item` no GA4 |
| Vendas | Quantidade vendida no período selecionado |
| Add% | Add to cart / Impressões × 100 |
| Conv% | Compras / Add to cart × 100 |

### Fórmula do Score (0–100)

| Métrica | Peso |
|---|---|
| Qtd vendida | 35% |
| VPM | 25% |
| Conv% | 20% |
| CTR% | 10% |
| Add% | 10% |

Score e Estoque/Dias Ativação são colunas separadas — os alertas visuais são:
- 🔴 Estoque ≤ 5 → ruptura iminente
- 🟡 Ativado há menos de 7 dias → "Em análise"
- ⚫ Impressões < 100 → amostra pequena

---

## Filtros e navegação

- **Filtro de período:** botões rápidos 7 / 15 / 30 / 60 / 90 dias + Período customizado (date pickers `de` / `ate`)
- **View padrão:** lista plana com todos os produtos (sem agrupamento por categoria)
- **Agrupamento por categoria:** toggle/opção secundária
- **Filtros por coluna:** campo de texto em cada coluna da tabela
- **Ordenação:** clique no cabeçalho de qualquer coluna

### API — parâmetros aceitos

```
GET /api/products?dias=30
GET /api/products?de=2026-01-01&ate=2026-01-31
```

---

## Histórico de problemas resolvidos

### Limite de 200 produtos
- **Problema:** radar exibia apenas 200 dos 700+ produtos cadastrados
- **Causa:** chamada à API da Nuvemshop sem paginação
- **Solução:** loop de paginação enquanto `products.length === 200`

### Estoque e Dias Ativação não apareciam
- **Problema:** colunas exibindo "—" após atualização
- **Causa (estoque):** campo de estoque mudou de mapeamento na última versão
- **Causa (dias ativação):** API da Nuvemshop rejeita `fields=published_at` — não pode ser usado como filtro, precisa retornar o produto completo
- **Solução:** remover o `fields=` do loop de datas; puxar o objeto de produto completo e extrair `published_at` ou `created_at`

### Calça Valentina Preto não aparecia no radar
- **Problema:** best seller #1 da loja não aparecia no topo do radar
- **Causa:** radar estava ordenado por CTR% por padrão; a Valentina tem VPM alto mas CTR% médio
- **Solução:** reordenar por VPM revela a Valentina como #1 real

---

## Insights de produto (referência de análise)

A melhor forma de avaliar produtos é cruzar:
- **VPM alto + Conv% alto + volume expressivo** = best seller real
- Produtos com Conv% muito alto mas poucas impressões (< 100) = amostra pequena, dado não confiável
- Estoque crítico (≤ 5 unidades) em produto com VPM alto = risco de ruptura iminente — prioridade de reposição

**Referência atual (período analisado em Mai/2026):**
- Best seller real: **Calça Alfaiataria Valentina Preta** — VPM 44.6, Conv% 24.6%, estoque 17 un.
- Alerta de ruptura na época: Valentina Cinza Escuro (3 unidades, VPM 25.8)

---

## Regra de ouro para prompts ao Claude Code

> **Não mexa em nada que está funcionando.** Toda alteração deve ser cirúrgica e mostrar o antes/depois antes de aplicar. Aguardar confirmação antes de salvar qualquer mudança.

---

## Deploy

```bash
# Autenticar com token da Vercel (necessário para Claude Code)
npx vercel --prod --token=SEU_TOKEN

# Gerar token em: vercel.com/account/tokens
# Scope: conta pessoal | Expiration: No expiration (ou 90 dias)
```

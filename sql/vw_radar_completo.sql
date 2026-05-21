CREATE OR REPLACE VIEW `itlook-analytics.analytics_395902084.vw_radar_completo` AS

WITH sessions_by_date AS (
  SELECT
    event_date,
    COUNT(DISTINCT user_pseudo_id) AS sessoes
  FROM `itlook-analytics.analytics_395902084.events_*`
  WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND event_name = 'session_start'
  GROUP BY event_date
),

product_events AS (
  SELECT
    event_date,
    event_name,
    TRIM(REGEXP_REPLACE(item.item_name, r'\s*\([^)]*\)\s*$', '')) AS produto
  FROM `itlook-analytics.analytics_395902084.events_*`
  CROSS JOIN UNNEST(items) AS item
  WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND event_name IN ('view_item', 'select_item', 'add_to_cart', 'purchase')
),

base AS (
  SELECT
    pe.event_date,
    pe.produto,
    COUNTIF(pe.event_name = 'view_item')   AS impressoes,
    COUNTIF(pe.event_name = 'select_item') AS cliques,
    COUNTIF(pe.event_name = 'add_to_cart') AS carrinho,
    COUNTIF(pe.event_name = 'purchase')    AS compras,
    ANY_VALUE(s.sessoes)                   AS sessoes
  FROM product_events pe
  LEFT JOIN sessions_by_date s ON pe.event_date = s.event_date
  GROUP BY pe.event_date, pe.produto
)

SELECT
  PARSE_DATE('%Y%m%d', event_date) AS data,
  produto,
  SUM(impressoes)  AS impressoes,
  SUM(cliques)     AS cliques,
  SUM(carrinho)    AS carrinho,
  SUM(compras)     AS compras,
  SUM(sessoes)     AS sessoes,
  SAFE_DIVIDE(SUM(cliques),  SUM(impressoes))        * 100  AS ctr,
  SAFE_DIVIDE(SUM(cliques),  NULLIF(SUM(sessoes),0)) * 100  AS ctr_sessao,
  SAFE_DIVIDE(SUM(compras),  NULLIF(SUM(impressoes),0)) * 1000 AS vpm,
  SAFE_DIVIDE(SUM(carrinho), NULLIF(SUM(impressoes),0)) * 100  AS add_rate,
  SAFE_DIVIDE(SUM(compras),  NULLIF(SUM(carrinho),0))  * 100  AS conversion_rate
FROM base
WHERE produto IS NOT NULL
  AND produto != ''
  AND LOWER(produto) NOT LIKE '%compra_r%pida%'
  AND LOWER(produto) NOT LIKE '%compra rapida%'
  AND LOWER(produto) NOT LIKE '%sale%'
GROUP BY data, produto

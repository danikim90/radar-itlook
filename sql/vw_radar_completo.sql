CREATE OR REPLACE VIEW `itlook-analytics.analytics_395902084.vw_radar_completo` AS

WITH base AS (
  SELECT
    event_date,
    (SELECT value.string_value FROM UNNEST(event_params) WHERE key = 'item_name') AS produto,
    COUNTIF(event_name = 'view_item') AS impressoes,
    COUNTIF(event_name = 'select_item') AS cliques,
    COUNTIF(event_name = 'add_to_cart') AS carrinho,
    COUNTIF(event_name = 'purchase') AS compras,
    COUNT(DISTINCT IF(event_name = 'session_start', user_pseudo_id, NULL)) AS sessoes
  FROM `itlook-analytics.analytics_395902084.events_*`
  WHERE _TABLE_SUFFIX >= FORMAT_DATE('%Y%m%d', DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY))
    AND event_name IN ('view_item', 'select_item', 'add_to_cart', 'purchase', 'session_start')
  GROUP BY event_date, produto
)

SELECT
  PARSE_DATE('%Y%m%d', event_date) AS data,
  produto,
  SUM(impressoes) AS impressoes,
  SUM(cliques) AS cliques,
  SUM(carrinho) AS carrinho,
  SUM(compras) AS compras,
  SUM(sessoes) AS sessoes,
  SAFE_DIVIDE(SUM(cliques), SUM(impressoes)) * 100 AS ctr,
  SAFE_DIVIDE(SUM(cliques), NULLIF(SUM(sessoes), 0)) * 100 AS ctr_sessao,
  SAFE_DIVIDE(SUM(compras), NULLIF(SUM(impressoes), 0)) * 1000 AS vpm,
  SAFE_DIVIDE(SUM(carrinho), NULLIF(SUM(impressoes), 0)) * 100 AS add_rate,
  SAFE_DIVIDE(SUM(compras), NULLIF(SUM(carrinho), 0)) * 100 AS conversion_rate
FROM base
WHERE produto IS NOT NULL
  AND LOWER(produto) NOT LIKE '%compra_r%pida%'
  AND LOWER(produto) NOT LIKE '%compra rapida%'
  AND LOWER(produto) NOT LIKE '%sale%'
GROUP BY data, produto

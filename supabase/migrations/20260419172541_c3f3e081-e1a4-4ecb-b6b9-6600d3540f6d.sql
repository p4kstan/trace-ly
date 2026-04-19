-- Limpar dead_letters causados pelo bug do conversion_action malformed.
-- Estes 10+ items falharam porque enviávamos o LABEL alfanumérico (UITqCO...) ao invés
-- do ID numérico (17862172125). Agora corrigido — marca como 'skipped' para parar
-- aparecerem como falhas no monitor.
UPDATE event_queue
SET status = 'skipped',
    last_error = 'historical: malformed conversion_action (label vs numeric id) — bug fixed',
    updated_at = now()
WHERE provider = 'google_ads'
  AND status = 'dead_letter'
  AND last_error LIKE '%No conversions with valid identifiers%';
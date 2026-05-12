-- Garante deduplicação forte por event_id em whatsapp_conversions.
-- Cada click_id pode gerar no máximo 1 Purchase (whatsapp_purchase:<click_id>).
CREATE UNIQUE INDEX IF NOT EXISTS whatsapp_conversions_workspace_event_id_uniq
  ON public.whatsapp_conversions (workspace_id, event_id);

-- Índice auxiliar para lookup por click_id (já existia implicitamente, garante).
CREATE INDEX IF NOT EXISTS whatsapp_conversions_workspace_click_id_idx
  ON public.whatsapp_conversions (workspace_id, click_id);
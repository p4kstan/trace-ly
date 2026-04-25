-- =========================================================================
-- TRAFFIC AGENT MODULE — migrations
-- All tables RLS-protected by workspace_id via is_workspace_member().
-- =========================================================================

-- 1. RUNS ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','running','succeeded','failed','cancelled')),
  mode            text NOT NULL DEFAULT 'dry_run'
                    CHECK (mode IN ('dry_run','recommendation','approval_required','auto')),
  started_at      timestamptz,
  finished_at     timestamptz,
  input_window    jsonb NOT NULL DEFAULT '{}'::jsonb,
  summary         jsonb NOT NULL DEFAULT '{}'::jsonb,
  error           text,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_runs_ws_created
  ON public.traffic_agent_runs(workspace_id, created_at DESC);

-- 2. RECOMMENDATIONS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_recommendations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id           uuid REFERENCES public.traffic_agent_runs(id) ON DELETE CASCADE,
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider         text NOT NULL,        -- google_ads | meta | tiktok | ga4 | tracking | queue
  account_id       text,
  campaign_id      text,
  entity_type      text NOT NULL,        -- campaign | ad_group | ad | tracking | destination | queue
  entity_id        text,
  action_type      text NOT NULL,        -- adjust_budget | pause | enable | adjust_bid | fix_tracking | ...
  priority         smallint NOT NULL DEFAULT 3 CHECK (priority BETWEEN 1 AND 5),
  confidence       numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  expected_impact  jsonb NOT NULL DEFAULT '{}'::jsonb,
  rationale        text NOT NULL DEFAULT '',
  evidence_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  rag_refs         jsonb NOT NULL DEFAULT '[]'::jsonb,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','superseded','executed','expired')),
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_recos_ws_status
  ON public.traffic_agent_recommendations(workspace_id, status, priority, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_recos_run
  ON public.traffic_agent_recommendations(run_id);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_recos_provider_campaign
  ON public.traffic_agent_recommendations(workspace_id, provider, campaign_id);

-- 3. ACTIONS ---------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_actions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id   uuid REFERENCES public.traffic_agent_recommendations(id) ON DELETE CASCADE,
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mode                text NOT NULL DEFAULT 'dry_run'
                        CHECK (mode IN ('dry_run','recommendation','approval_required','auto')),
  action_type         text NOT NULL,
  provider            text NOT NULL,
  account_id          text,
  campaign_id         text,
  entity_id           text,
  proposed_payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  simulated_result    jsonb NOT NULL DEFAULT '{}'::jsonb,
  approval_status     text NOT NULL DEFAULT 'pending'
                        CHECK (approval_status IN ('pending','approved','rejected','auto_blocked')),
  execution_status    text NOT NULL DEFAULT 'not_executed'
                        CHECK (execution_status IN ('not_executed','simulated','executed','rolled_back','failed')),
  rollback_payload    jsonb NOT NULL DEFAULT '{}'::jsonb,
  guardrail_decision  jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now(),
  executed_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_actions_ws
  ON public.traffic_agent_actions(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_actions_reco
  ON public.traffic_agent_actions(recommendation_id);

-- 4. ACTION LOGS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_action_logs (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action_id     uuid REFERENCES public.traffic_agent_actions(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  level         text NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error')),
  message       text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_action_logs_action
  ON public.traffic_agent_action_logs(action_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_action_logs_ws
  ON public.traffic_agent_action_logs(workspace_id, created_at DESC);

-- 5. MEMORY ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_memory (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  memory_type   text NOT NULL,        -- learning | preference | observation | fact
  key           text NOT NULL,
  value_json    jsonb NOT NULL DEFAULT '{}'::jsonb,
  confidence    numeric(4,3) NOT NULL DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, memory_type, key)
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_memory_ws_type
  ON public.traffic_agent_memory(workspace_id, memory_type, last_seen_at DESC);

-- 6. KNOWLEDGE DOCUMENTS (RAG) --------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_knowledge_documents (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title         text NOT NULL,
  source_type   text NOT NULL DEFAULT 'manual'
                  CHECK (source_type IN ('manual','upload','url','automated')),
  provider      text,
  content_hash  text NOT NULL,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  active        boolean NOT NULL DEFAULT true,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, content_hash)
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_knowledge_docs_ws
  ON public.traffic_agent_knowledge_documents(workspace_id, active, created_at DESC);

-- 7. KNOWLEDGE CHUNKS (RAG) -----------------------------------------------
-- pgvector NOT enabled in this project, so embedding stays as jsonb (nullable)
-- and code falls back to tsvector. Keeping jsonb means evolution to pgvector
-- later can ALTER COLUMN ... TYPE vector USING (...) without dropping data.
CREATE TABLE IF NOT EXISTS public.traffic_agent_knowledge_chunks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id   uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  document_id    uuid NOT NULL REFERENCES public.traffic_agent_knowledge_documents(id) ON DELETE CASCADE,
  chunk_index    int  NOT NULL,
  content        text NOT NULL,
  content_hash   text NOT NULL,
  metadata       jsonb NOT NULL DEFAULT '{}'::jsonb,
  search_vector  tsvector
                  GENERATED ALWAYS AS (to_tsvector('simple', coalesce(content, ''))) STORED,
  embedding      jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_chunks_ws_doc
  ON public.traffic_agent_knowledge_chunks(workspace_id, document_id);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_chunks_search
  ON public.traffic_agent_knowledge_chunks USING gin(search_vector);

-- 8. CAMPAIGN METRICS SNAPSHOTS -------------------------------------------
CREATE TABLE IF NOT EXISTS public.campaign_metrics_snapshots (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  provider        text NOT NULL,
  account_id      text,
  campaign_id     text NOT NULL,
  date_start      date NOT NULL,
  date_end        date NOT NULL,
  impressions     bigint NOT NULL DEFAULT 0,
  clicks          bigint NOT NULL DEFAULT 0,
  spend_cents     bigint NOT NULL DEFAULT 0,
  conversions     numeric NOT NULL DEFAULT 0,
  revenue_cents   bigint NOT NULL DEFAULT 0,
  cpa_cents       bigint,
  roas            numeric,
  ctr             numeric,
  cvr             numeric,
  raw_metrics     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, provider, campaign_id, date_start, date_end)
);
CREATE INDEX IF NOT EXISTS idx_campaign_metrics_snap_ws_dates
  ON public.campaign_metrics_snapshots(workspace_id, provider, date_end DESC);

-- 9. GUARDRAILS ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_guardrails (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id                uuid NOT NULL UNIQUE REFERENCES public.workspaces(id) ON DELETE CASCADE,
  mode                        text NOT NULL DEFAULT 'dry_run'
                                CHECK (mode IN ('dry_run','recommendation','approval_required','auto')),
  min_conversions             int  NOT NULL DEFAULT 30 CHECK (min_conversions >= 0),
  min_spend_cents             bigint NOT NULL DEFAULT 5000 CHECK (min_spend_cents >= 0),
  max_budget_change_percent   numeric NOT NULL DEFAULT 20 CHECK (max_budget_change_percent BETWEEN 0 AND 100),
  max_bid_change_percent      numeric NOT NULL DEFAULT 15 CHECK (max_bid_change_percent BETWEEN 0 AND 100),
  max_actions_per_day         int  NOT NULL DEFAULT 5 CHECK (max_actions_per_day >= 0),
  cooldown_hours              int  NOT NULL DEFAULT 24 CHECK (cooldown_hours >= 0),
  max_daily_budget_cents      bigint,
  target_cpa_cents            bigint,
  target_roas                 numeric,
  rollback_required           boolean NOT NULL DEFAULT true,
  human_approval_required     boolean NOT NULL DEFAULT true,
  allow_live_mutations        boolean NOT NULL DEFAULT false,
  active                      boolean NOT NULL DEFAULT true,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);

-- 10. MCP TOOL CALLS -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.traffic_agent_mcp_tool_calls (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  run_id               uuid REFERENCES public.traffic_agent_runs(id) ON DELETE SET NULL,
  tool_name            text NOT NULL,
  arguments_redacted   jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_summary       jsonb NOT NULL DEFAULT '{}'::jsonb,
  status               text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','blocked')),
  duration_ms          int,
  created_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_mcp_calls_ws
  ON public.traffic_agent_mcp_tool_calls(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffic_agent_mcp_calls_run
  ON public.traffic_agent_mcp_tool_calls(run_id);

-- =========================================================================
-- RLS — enable + policies (workspace-member only)
-- =========================================================================
ALTER TABLE public.traffic_agent_runs                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_recommendations       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_actions               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_action_logs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_memory                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_knowledge_documents   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_knowledge_chunks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaign_metrics_snapshots          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_guardrails            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traffic_agent_mcp_tool_calls        ENABLE ROW LEVEL SECURITY;

-- Helper: members can SELECT, admins+ can INSERT/UPDATE on policy tables.
-- For audit-style tables (action_logs, mcp_tool_calls), only service_role writes.

-- runs
CREATE POLICY "ws members read runs"   ON public.traffic_agent_runs
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write runs"  ON public.traffic_agent_runs
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update runs" ON public.traffic_agent_runs
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- recommendations
CREATE POLICY "ws members read recos"   ON public.traffic_agent_recommendations
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write recos"  ON public.traffic_agent_recommendations
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update recos" ON public.traffic_agent_recommendations
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- actions
CREATE POLICY "ws members read actions"   ON public.traffic_agent_actions
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write actions"  ON public.traffic_agent_actions
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update actions" ON public.traffic_agent_actions
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- action_logs (read for ws members; write only via service_role/edge funcs)
CREATE POLICY "ws members read action logs" ON public.traffic_agent_action_logs
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- memory
CREATE POLICY "ws members read memory"   ON public.traffic_agent_memory
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write memory"  ON public.traffic_agent_memory
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update memory" ON public.traffic_agent_memory
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- knowledge documents
CREATE POLICY "ws members read kdocs"   ON public.traffic_agent_knowledge_documents
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write kdocs"  ON public.traffic_agent_knowledge_documents
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members update kdocs" ON public.traffic_agent_knowledge_documents
  FOR UPDATE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members delete kdocs" ON public.traffic_agent_knowledge_documents
  FOR DELETE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- knowledge chunks
CREATE POLICY "ws members read kchunks"  ON public.traffic_agent_knowledge_chunks
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write kchunks" ON public.traffic_agent_knowledge_chunks
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members delete kchunks"ON public.traffic_agent_knowledge_chunks
  FOR DELETE TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- snapshots
CREATE POLICY "ws members read snaps"  ON public.campaign_metrics_snapshots
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws members write snaps" ON public.campaign_metrics_snapshots
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_member(auth.uid(), workspace_id));

-- guardrails
CREATE POLICY "ws members read guardrails"   ON public.traffic_agent_guardrails
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));
CREATE POLICY "ws admins write guardrails"   ON public.traffic_agent_guardrails
  FOR INSERT TO authenticated WITH CHECK (public.is_workspace_admin(auth.uid(), workspace_id));
CREATE POLICY "ws admins update guardrails"  ON public.traffic_agent_guardrails
  FOR UPDATE TO authenticated USING (public.is_workspace_admin(auth.uid(), workspace_id));

-- mcp tool calls (read for ws members; writes only via service_role)
CREATE POLICY "ws members read mcp calls" ON public.traffic_agent_mcp_tool_calls
  FOR SELECT TO authenticated USING (public.is_workspace_member(auth.uid(), workspace_id));

-- =========================================================================
-- Helper functions
-- =========================================================================

-- updated_at trigger for guardrails
CREATE OR REPLACE FUNCTION public.tg_traffic_agent_guardrails_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

DROP TRIGGER IF EXISTS trg_traffic_agent_guardrails_updated_at ON public.traffic_agent_guardrails;
CREATE TRIGGER trg_traffic_agent_guardrails_updated_at
  BEFORE UPDATE ON public.traffic_agent_guardrails
  FOR EACH ROW EXECUTE FUNCTION public.tg_traffic_agent_guardrails_updated_at();

-- Get-or-create guardrails (safe defaults: dry_run + no live mutations)
CREATE OR REPLACE FUNCTION public.get_or_create_traffic_agent_guardrails(_workspace_id uuid)
RETURNS public.traffic_agent_guardrails
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g public.traffic_agent_guardrails;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF NOT public.is_workspace_member(auth.uid(), _workspace_id) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO g FROM public.traffic_agent_guardrails WHERE workspace_id = _workspace_id;
  IF NOT FOUND THEN
    INSERT INTO public.traffic_agent_guardrails (workspace_id)
      VALUES (_workspace_id) RETURNING * INTO g;
  END IF;
  RETURN g;
END $$;

-- List recommendations (used by UI)
CREATE OR REPLACE FUNCTION public.list_traffic_agent_recommendations(
  _workspace_id uuid, _status text DEFAULT NULL, _limit int DEFAULT 100
) RETURNS SETOF public.traffic_agent_recommendations
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_limit int := LEAST(GREATEST(coalesce(_limit, 100), 1), 500);
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.is_workspace_member(auth.uid(), _workspace_id) THEN RETURN; END IF;

  RETURN QUERY
  SELECT r.* FROM public.traffic_agent_recommendations r
   WHERE r.workspace_id = _workspace_id
     AND (_status IS NULL OR r.status = _status)
   ORDER BY r.priority ASC, r.created_at DESC
   LIMIT v_limit;
END $$;
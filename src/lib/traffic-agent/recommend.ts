/**
 * Pure recommendation engine.
 *
 * Given workspace signals (tracking quality, conversion health, queue health,
 * campaign metrics) returns a prioritized list of recommendations.
 *
 * No I/O, no LLM. The LLM layer in `traffic-agent-evaluate` may add
 * narrative / RAG-grounded rationale on top, but the priority order and
 * sample-size gates are decided here so they are testable.
 */

export interface TrackingSignals {
  total_purchases: number;
  purchase_without_dispatch: number;
  identifier_coverage: {
    gclid: number;
    gbraid: number;
    wbraid: number;
    fbp: number;
    fbc: number;
    ttclid: number;
    msclkid: number;
  }; // each is a fraction in [0,1]
}

export interface QueueSignals {
  pending: number;
  failed: number;
  dead_letter: number;
  oldest_pending_minutes: number;
}

export interface DestinationSignals {
  total: number;
  with_recent_error: number;
  disabled: number;
}

export interface CampaignSignal {
  provider: string;
  account_id?: string;
  campaign_id: string;
  spend_cents: number;
  conversions: number;
  cpa_cents: number | null;
  roas: number | null;
  cvr: number | null;
}

export interface RecommendationDraft {
  provider: string;
  account_id?: string;
  campaign_id?: string;
  entity_type: string;
  entity_id?: string;
  action_type: string;
  priority: 1 | 2 | 3 | 4 | 5;
  confidence: number;
  expected_impact: Record<string, unknown>;
  rationale: string;
  evidence_json: Record<string, unknown>;
}

export interface RecommendInput {
  window_days: number;
  tracking?: TrackingSignals;
  queue?: QueueSignals;
  destinations?: DestinationSignals;
  campaigns?: CampaignSignal[];
  guardrails: { min_conversions: number; min_spend_cents: number };
}

export function buildRecommendations(input: RecommendInput): RecommendationDraft[] {
  const out: RecommendationDraft[] = [];
  const window = { window_days: input.window_days };

  // ---- 1. Tracking issues come first --------------------------------------
  const t = input.tracking;
  if (t && t.total_purchases > 0) {
    const dispatchMissingRate = t.purchase_without_dispatch / t.total_purchases;
    if (dispatchMissingRate >= 0.05) {
      out.push({
        provider: "tracking",
        entity_type: "tracking",
        action_type: "fix_purchase_dispatch_gap",
        priority: 1,
        confidence: Math.min(0.95, 0.6 + dispatchMissingRate),
        expected_impact: { recoverable_conversions_pct: dispatchMissingRate },
        rationale:
          "Há compras canônicas sem dispatch para destinos de mídia. Isso degrada otimização do leiloeiro e atribuição.",
        evidence_json: { ...window, dispatch_missing_rate: dispatchMissingRate, total_purchases: t.total_purchases },
      });
    }
    const lowCoverage = (Object.entries(t.identifier_coverage) as Array<[string, number]>).filter(
      ([, v]) => v < 0.3,
    );
    if (lowCoverage.length > 0) {
      out.push({
        provider: "tracking",
        entity_type: "tracking",
        action_type: "improve_identifier_coverage",
        priority: 2,
        confidence: 0.8,
        expected_impact: { providers_affected: lowCoverage.map(([k]) => k) },
        rationale:
          "Cobertura abaixo de 30% para um ou mais identificadores de clique. Sem eles, o leiloeiro recebe sinal fraco.",
        evidence_json: { ...window, low_coverage: Object.fromEntries(lowCoverage) },
      });
    }
  }

  // ---- 2. Queue / destination health --------------------------------------
  const q = input.queue;
  if (q) {
    if (q.dead_letter > 0) {
      out.push({
        provider: "queue",
        entity_type: "queue",
        action_type: "drain_dead_letter",
        priority: 1,
        confidence: 0.9,
        expected_impact: { dead_letter_count: q.dead_letter },
        rationale: "Eventos em dead-letter param de chegar nos destinos. Reprocessar (replay) ou diagnosticar a causa.",
        evidence_json: { ...window, ...q },
      });
    } else if (q.failed > 5 || q.oldest_pending_minutes > 30) {
      out.push({
        provider: "queue",
        entity_type: "queue",
        action_type: "investigate_queue_lag",
        priority: 2,
        confidence: 0.75,
        expected_impact: {},
        rationale: "Fila com falhas recorrentes ou eventos antigos pendentes.",
        evidence_json: { ...window, ...q },
      });
    }
  }
  const d = input.destinations;
  if (d && d.with_recent_error > 0) {
    out.push({
      provider: "tracking",
      entity_type: "destination",
      action_type: "fix_destination_errors",
      priority: 2,
      confidence: 0.8,
      expected_impact: { destinations_with_error: d.with_recent_error },
      rationale: "Um ou mais destinos de marketing tiveram erro recente. Verificar credenciais e gating.",
      evidence_json: { ...window, ...d },
    });
  }

  // ---- 3. Campaign tuning — only with sample size -------------------------
  for (const c of input.campaigns ?? []) {
    if (c.conversions < input.guardrails.min_conversions || c.spend_cents < input.guardrails.min_spend_cents) {
      out.push({
        provider: c.provider,
        account_id: c.account_id,
        campaign_id: c.campaign_id,
        entity_type: "campaign",
        entity_id: c.campaign_id,
        action_type: "collect_more_data",
        priority: 4,
        confidence: 0.6,
        expected_impact: {},
        rationale:
          "Amostra abaixo do mínimo definido pelos guardrails. Não recomendamos ajustar verba/lance ainda.",
        evidence_json: {
          ...window,
          spend_cents: c.spend_cents,
          conversions: c.conversions,
          min_conversions: input.guardrails.min_conversions,
          min_spend_cents: input.guardrails.min_spend_cents,
        },
      });
      continue;
    }

    if (c.roas != null && c.roas >= 2.5) {
      out.push({
        provider: c.provider,
        account_id: c.account_id,
        campaign_id: c.campaign_id,
        entity_type: "campaign",
        entity_id: c.campaign_id,
        action_type: "scale_up",
        priority: 3,
        confidence: 0.7,
        expected_impact: { suggested_budget_change_pct: 15 },
        rationale: `ROAS ${c.roas.toFixed(2)} acima do alvo. Sugerimos escalar verba dentro do limite de guardrails.`,
        evidence_json: { ...window, ...c },
      });
    } else if (c.roas != null && c.roas < 1.0) {
      out.push({
        provider: c.provider,
        account_id: c.account_id,
        campaign_id: c.campaign_id,
        entity_type: "campaign",
        entity_id: c.campaign_id,
        action_type: "scale_down",
        priority: 3,
        confidence: 0.7,
        expected_impact: { suggested_budget_change_pct: -15 },
        rationale: `ROAS ${c.roas.toFixed(2)} abaixo de 1. Reduzir verba e investigar criativo/segmentação.`,
        evidence_json: { ...window, ...c },
      });
    }
  }

  // Sort: priority ASC, confidence DESC
  out.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence);
  return out;
}

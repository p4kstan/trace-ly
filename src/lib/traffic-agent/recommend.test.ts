import { describe, it, expect } from "vitest";
import { buildRecommendations } from "./recommend";

const baseGuardrails = { min_conversions: 30, min_spend_cents: 5000 };

describe("traffic-agent/recommend", () => {
  it("recommends collect_more_data when sample is too small (no scale up/down)", () => {
    const r = buildRecommendations({
      window_days: 7,
      campaigns: [
        {
          provider: "google_ads",
          campaign_id: "c1",
          spend_cents: 1000,
          conversions: 5,
          cpa_cents: 200,
          roas: 3.0,
          cvr: 0.05,
        },
      ],
      guardrails: baseGuardrails,
    });
    const types = r.map((x) => x.action_type);
    expect(types).toContain("collect_more_data");
    expect(types).not.toContain("scale_up");
  });

  it("prioritises tracking issues before campaign tuning", () => {
    const r = buildRecommendations({
      window_days: 7,
      tracking: {
        total_purchases: 100,
        purchase_without_dispatch: 20,
        identifier_coverage: { gclid: 0.1, gbraid: 0.0, wbraid: 0.0, fbp: 0.9, fbc: 0.9, ttclid: 0, msclkid: 0 },
      },
      campaigns: [
        {
          provider: "google_ads",
          campaign_id: "c2",
          spend_cents: 1_000_000,
          conversions: 100,
          cpa_cents: 100,
          roas: 3.0,
          cvr: 0.05,
        },
      ],
      guardrails: baseGuardrails,
    });
    expect(r[0].action_type).toBe("fix_purchase_dispatch_gap");
  });

  it("recommends scale_up when ROAS high and sample sufficient", () => {
    const r = buildRecommendations({
      window_days: 14,
      campaigns: [
        {
          provider: "google_ads",
          campaign_id: "c3",
          spend_cents: 1_000_000,
          conversions: 200,
          cpa_cents: 50,
          roas: 4.0,
          cvr: 0.1,
        },
      ],
      guardrails: baseGuardrails,
    });
    expect(r.find((x) => x.action_type === "scale_up")).toBeTruthy();
  });
});

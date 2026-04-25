import { describe, it, expect, vi } from "vitest";

// Smoke tests: verify each critical route's module loads without throwing.
// Full render would require auth/supabase/provider scaffolding; these checks
// at least catch import-time crashes that cause a blank screen in production.

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }) }),
    rpc: () => Promise.resolve({ data: [], error: null }),
    functions: { invoke: () => Promise.resolve({ data: {}, error: null }) },
    auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) },
  },
}));

const routes: Array<[string, () => Promise<unknown>]> = [
  ["/", () => import("@/pages/Dashboard")],
  ["/traffic-agent", () => import("@/pages/TrafficAgent")],
  ["/data-reuse-center", () => import("@/pages/DataReuseCenter")],
  ["/destination-registry", () => import("@/pages/DestinationRegistry")],
  ["/release-report", () => import("@/pages/ReleaseReport")],
  ["/prompt-generator", () => import("@/pages/PromptGenerator")],
];

describe("Route smoke tests (import-time)", () => {
  for (const [path, loader] of routes) {
    it(`loads ${path} without throwing`, async () => {
      const mod: any = await loader();
      expect(mod).toBeDefined();
      // Default export should be a function (React component)
      expect(typeof mod.default).toBe("function");
    });
  }
});

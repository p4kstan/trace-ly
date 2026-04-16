// Shared account routing helper for multi-account support (Google Ads + Meta)
// Determines which destination accounts should receive a given event
// based on routing_mode: 'all' | 'domain' | 'tag'

export interface RoutableAccount {
  id: string;
  routing_mode?: string | null;
  routing_domains?: string[] | null;
  routing_tags?: string[] | null;
  is_default?: boolean | null;
}

export interface EventContext {
  /** event_source_url or page URL — used for domain matching */
  url?: string | null;
  /** account_tag from SDK or custom_data — used for tag matching */
  tag?: string | null;
}

function extractHostname(url?: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return u.hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

function domainMatches(hostname: string, patterns: string[]): boolean {
  return patterns.some((p) => {
    const clean = p.toLowerCase().trim().replace(/^www\./, "");
    if (!clean) return false;
    // exact match OR subdomain match
    return hostname === clean || hostname.endsWith("." + clean);
  });
}

/**
 * Filter accounts that should receive this event.
 * - 'all'    → always include
 * - 'domain' → include if event URL hostname matches one of routing_domains
 * - 'tag'    → include if event tag matches one of routing_tags
 *
 * If no account matches via domain/tag, falls back to default account.
 */
export function selectAccounts<T extends RoutableAccount>(
  accounts: T[],
  ctx: EventContext
): T[] {
  if (!accounts.length) return [];

  const hostname = extractHostname(ctx.url);
  const tag = ctx.tag?.toString().toLowerCase().trim() || null;

  const matched = accounts.filter((a) => {
    const mode = (a.routing_mode || "all").toLowerCase();
    if (mode === "all") return true;
    if (mode === "domain") {
      if (!hostname) return false;
      return domainMatches(hostname, a.routing_domains || []);
    }
    if (mode === "tag") {
      if (!tag) return false;
      return (a.routing_tags || []).map((t) => t.toLowerCase().trim()).includes(tag);
    }
    return false;
  });

  if (matched.length > 0) return matched;

  // Fallback: default account(s)
  const defaults = accounts.filter((a) => a.is_default);
  return defaults.length > 0 ? defaults : [];
}

/** Extract routing tag from event payload (custom_data.account_tag or user_data.account_tag) */
export function extractTag(event: {
  custom_data_json?: Record<string, unknown> | null;
  user_data_json?: Record<string, unknown> | null;
  payload_json?: Record<string, unknown> | null;
}): string | null {
  const cd = (event.custom_data_json || {}) as Record<string, unknown>;
  const ud = (event.user_data_json || {}) as Record<string, unknown>;
  const pj = (event.payload_json || {}) as Record<string, unknown>;
  const tag =
    (cd.account_tag as string | undefined) ||
    (ud.account_tag as string | undefined) ||
    (pj.account_tag as string | undefined);
  return tag ? String(tag) : null;
}

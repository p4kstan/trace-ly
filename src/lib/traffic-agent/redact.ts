/**
 * PII redaction for the Traffic Agent.
 *
 * Used everywhere we log/persist anything that might end up in:
 *   - traffic_agent_mcp_tool_calls.arguments_redacted
 *   - traffic_agent_mcp_tool_calls.result_summary
 *   - traffic_agent_action_logs.message / metadata
 *   - LLM prompts
 *   - console
 *
 * Conservative: prefers over-masking to leaking. Pure functions, no I/O.
 */

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
// E.164-ish + Brazilian formats
const PHONE_RE = /\+?\d[\d().\-\s]{7,}\d/g;
// Brazilian CPF / CNPJ (best-effort)
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
// Bearer tokens / generic api keys
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]{16,}\b/gi;
const APIKEY_RE = /\b(?:sk|pk|key|token|secret)[_\-][A-Za-z0-9]{16,}\b/gi;

const SENSITIVE_KEYS = [
  "password",
  "passwd",
  "secret",
  "token",
  "access_token",
  "refresh_token",
  "api_key",
  "apikey",
  "authorization",
  "bearer",
  "client_secret",
  "private_key",
  "email",
  "phone",
  "cpf",
  "cnpj",
  "customer_email",
  "customer_phone",
  "user_data",
  "user_data_json",
  "raw_payload",
  "payload_json",
];

function isSensitiveKey(key: string): boolean {
  const k = key.toLowerCase();
  return SENSITIVE_KEYS.some((s) => k === s || k.includes(s));
}

export function redactString(s: string): string {
  if (!s) return s;
  let out = s;
  out = out.replace(EMAIL_RE, "[redacted_email]");
  out = out.replace(BEARER_RE, "[redacted_bearer]");
  out = out.replace(APIKEY_RE, "[redacted_key]");
  out = out.replace(CPF_RE, "[redacted_cpf]");
  out = out.replace(CNPJ_RE, "[redacted_cnpj]");
  out = out.replace(PHONE_RE, (m) => (m.replace(/\D/g, "").length >= 8 ? "[redacted_phone]" : m));
  return out;
}

export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[redacted_depth]";
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return redactString(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => redactValue(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    let count = 0;
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (count++ > 100) {
        out["__truncated__"] = true;
        break;
      }
      if (isSensitiveKey(k)) {
        out[k] = "[redacted]";
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  return "[redacted_unknown]";
}

/** Hash an arbitrary string into a short non-reversible id (for grouping). */
export async function shortHash(input: string): Promise<string> {
  const enc = new TextEncoder().encode(input);
  // SubtleCrypto is available in browsers and Deno.
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return hex.slice(0, 16);
}

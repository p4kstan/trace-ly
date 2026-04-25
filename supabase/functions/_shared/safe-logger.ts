// Shared PII/secret-safe logger for Edge Functions.
//
// Goal: a drop-in replacement for `console.log/warn/error` that REDACTS
// known-sensitive fields BEFORE they reach the platform log stream.
//
// Redaction policy:
//   - Object keys whose name (case-insensitive) matches a PII / secret key
//     (or ends with `_<piiKey>`) are replaced with "[REDACTED]".
//   - Hashed variants (`*_hash`, `*_sha256`) are kept — they are safe.
//   - String values that LOOK like emails / CPF / CNPJ / Brazilian phone /
//     long bearer-tokens / "pix copia e cola" payloads are masked even when
//     the key itself is innocuous.
//   - Recursion is depth-limited (8) and array-length-capped (50) to avoid
//     blow-up on huge payloads.
//
// Usage:
//   import { createSafeLogger } from "../_shared/safe-logger.ts";
//   const log = createSafeLogger("gateway-webhook");
//   log.info("processed event", { eventId, customer }); // customer.email is redacted

const PII_KEYS = new Set([
  "email", "e_mail", "mail",
  "phone", "telephone", "mobile", "whatsapp",
  "cpf", "cnpj", "document", "doc", "rg", "ssn", "passport",
  "first_name", "last_name", "full_name", "name",
  "address", "street", "city", "zip", "zipcode", "postal_code", "postalcode",
  "birthdate", "birthday", "dob",
  "ip", "ip_address", "client_ip", "user_ip",
  // secrets
  "token", "access_token", "refresh_token", "id_token",
  "secret", "client_secret", "api_key", "apikey",
  "password", "pwd",
  "authorization", "auth",
  "cookie", "set_cookie",
  "session", "session_id",
  // payment
  "card", "card_number", "cardnumber", "cvv", "cvc",
  "pix_copia_cola", "pix_emv", "qr_code", "qrcode", "emv",
]);

const HASH_SUFFIXES = ["_hash", "_sha256", "_sha1", "_md5"];

const MAX_DEPTH = 8;
const MAX_ARRAY_LEN = 50;
const MAX_STRING_LEN = 2000;

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
// Brazilian docs / phones (loose).
const CPF_RE = /\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g;
const CNPJ_RE = /\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g;
const PHONE_BR_RE = /\(?\+?\d{0,3}\)?[\s-]?\(?\d{2,3}\)?[\s-]?\d{4,5}[\s-]?\d{4}/g;
// Bearer-ish tokens / JWT-ish.
const BEARER_RE = /\bBearer\s+[A-Za-z0-9._\-]{12,}\b/gi;
const JWT_RE = /\beyJ[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\.[A-Za-z0-9_\-]{8,}\b/g;
// Pix EMV "copia e cola" — starts with "00020126" and is 60+ chars.
const PIX_EMV_RE = /\b00020126[0-9A-Za-z]{40,}\b/g;

function isHashedKey(lower: string): boolean {
  return HASH_SUFFIXES.some((s) => lower.endsWith(s));
}

function isPiiKey(rawKey: string): boolean {
  const lower = rawKey.toLowerCase();
  if (isHashedKey(lower)) return false;
  if (PII_KEYS.has(lower)) return true;
  // catches "customer_email", "user.phone_number" → "phone_number"
  for (const p of PII_KEYS) {
    if (lower === p) return true;
    if (lower.endsWith(`_${p}`)) return true;
  }
  return false;
}

function maskString(s: string): string {
  if (s.length > MAX_STRING_LEN) s = s.slice(0, MAX_STRING_LEN) + "…[truncated]";
  return s
    .replace(EMAIL_RE, "[REDACTED_EMAIL]")
    .replace(JWT_RE, "[REDACTED_JWT]")
    .replace(BEARER_RE, "Bearer [REDACTED_TOKEN]")
    .replace(PIX_EMV_RE, "[REDACTED_PIX_EMV]")
    .replace(CPF_RE, "[REDACTED_CPF]")
    .replace(CNPJ_RE, "[REDACTED_CNPJ]")
    .replace(PHONE_BR_RE, "[REDACTED_PHONE]");
}

function redact(value: unknown, depth = 0): unknown {
  if (value == null) return value;
  if (depth > MAX_DEPTH) return "[REDACTED_DEPTH]";
  const t = typeof value;
  if (t === "string") return maskString(value as string);
  if (t === "number" || t === "boolean" || t === "bigint") return value;
  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ARRAY_LEN).map((v) => redact(v, depth + 1));
    if (value.length > MAX_ARRAY_LEN) out.push(`…[+${value.length - MAX_ARRAY_LEN} more]`);
    return out;
  }
  if (t === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (isPiiKey(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  // functions / symbols etc.
  return "[unserializable]";
}

/** Public API: safely scrub anything before logging. Exported for tests. */
export function sanitizeForLog(value: unknown): unknown {
  return redact(value, 0);
}

type LogLevel = "log" | "info" | "warn" | "error" | "debug";

export interface SafeLogger {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  /** raw — last-resort, still scrubbed but no prefix. */
  raw: (level: LogLevel, ...args: unknown[]) => void;
}

export function createSafeLogger(scope: string): SafeLogger {
  const prefix = `[${scope}]`;
  const emit = (level: LogLevel, args: unknown[]) => {
    const safe = args.map((a) => sanitizeForLog(a));
    // eslint-disable-next-line no-console
    (console as any)[level === "debug" ? "log" : level](prefix, ...safe);
  };
  return {
    log:   (...a) => emit("log",   a),
    info:  (...a) => emit("info",  a),
    warn:  (...a) => emit("warn",  a),
    error: (...a) => emit("error", a),
    debug: (...a) => emit("debug", a),
    raw:   (lvl, ...a) => emit(lvl, a),
  };
}

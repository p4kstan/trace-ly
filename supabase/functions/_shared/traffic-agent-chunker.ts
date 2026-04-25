// Mirror of src/lib/traffic-agent/chunker.ts for Deno edge.
export function chunkText(text: string, opts: { maxChars?: number; overlap?: number } = {}): string[] {
  const max = Math.max(200, Math.min(opts.maxChars ?? 1200, 4000));
  const overlap = Math.max(0, Math.min(opts.overlap ?? 100, Math.floor(max / 4)));
  const clean = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  if (clean.length <= max) return [clean];

  const paras = clean.split(/\n{2,}/);
  const out: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (!buf) { buf = p; continue; }
    if (buf.length + 2 + p.length <= max) buf += "\n\n" + p;
    else { out.push(buf); buf = p; }
  }
  if (buf) out.push(buf);

  // Split paragraphs that are themselves too long.
  const final: string[] = [];
  for (const c of out) {
    if (c.length <= max) { final.push(c); continue; }
    let i = 0;
    while (i < c.length) {
      const piece = c.slice(i, i + max);
      final.push(piece);
      i += max - overlap;
    }
  }
  return final.filter((s) => s.trim().length > 0);
}

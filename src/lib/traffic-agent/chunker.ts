/**
 * Tiny RAG chunker. Splits arbitrary text into ~chunk_size pieces, preferring
 * paragraph and sentence boundaries. Pure / no I/O.
 */
export interface Chunk {
  index: number;
  content: string;
}

export function chunkText(input: string, opts: { chunkSize?: number; overlap?: number } = {}): Chunk[] {
  const chunkSize = opts.chunkSize ?? 800;
  const overlap = opts.overlap ?? 80;
  const text = (input ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return [];

  const out: Chunk[] = [];
  let i = 0;
  let idx = 0;
  while (i < text.length) {
    let end = Math.min(text.length, i + chunkSize);
    if (end < text.length) {
      // Prefer paragraph break, then sentence, then word.
      const slice = text.slice(i, end);
      const lastPara = slice.lastIndexOf("\n\n");
      const lastSentence = Math.max(slice.lastIndexOf(". "), slice.lastIndexOf("! "), slice.lastIndexOf("? "));
      const lastSpace = slice.lastIndexOf(" ");
      const cut = lastPara > chunkSize * 0.4 ? lastPara : lastSentence > chunkSize * 0.4 ? lastSentence + 1 : lastSpace;
      if (cut > 0) end = i + cut;
    }
    const piece = text.slice(i, end).trim();
    if (piece) out.push({ index: idx++, content: piece });
    if (end >= text.length) break;
    i = Math.max(end - overlap, i + 1);
  }
  return out;
}

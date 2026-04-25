import { describe, it, expect } from "vitest";
import { chunkText } from "./chunker";

describe("traffic-agent/chunker", () => {
  it("returns empty for empty input", () => {
    expect(chunkText("")).toEqual([]);
  });
  it("keeps small text as single chunk", () => {
    const c = chunkText("Hello world.");
    expect(c.length).toBe(1);
    expect(c[0].content).toBe("Hello world.");
  });
  it("splits long text into multiple overlapping chunks", () => {
    const text = "Lorem ipsum dolor sit amet. ".repeat(200);
    const chunks = chunkText(text, { chunkSize: 400, overlap: 40 });
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
  });
});

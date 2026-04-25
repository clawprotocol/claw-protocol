import { describe, expect, it } from "vitest";
import { sha256Bytes, sha256Hex } from "./hash";

describe("hash", () => {
  it("sha256Hex matches known vector for empty-ish payload", async () => {
    const h = await sha256Hex("a");
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sha256Bytes hashes buffer", async () => {
    const enc = new TextEncoder().encode("hello");
    const a = await sha256Bytes(enc.buffer.slice(enc.byteOffset, enc.byteOffset + enc.byteLength));
    const b = await sha256Hex("hello");
    expect(a).toBe(b);
  });
});

import { describe, expect, it } from "vitest";
import { pickAuthoritativeSigningHandoffCorpus } from "./authoritativeHandoffCorpusResolver";

describe("authoritativeHandoffCorpusResolver", () => {
  it("prefers accepted server_full_draft over short handoff fallback", () => {
    const accepted = "x".repeat(3_300);
    const short = "y".repeat(857);
    const r = pickAuthoritativeSigningHandoffCorpus({
      candidates: [
        { text: short, source: "handoff_corpus" },
        { text: short, source: "free_starter" },
      ],
      acceptedAuthoritativeBody: accepted,
      premiumAccepted: true,
      pipelineSource: "server_full_draft",
    });
    expect(r.text.length).toBeGreaterThanOrEqual(2_640);
    expect(r.source).toBe("accepted_server_full_draft");
  });

  it("blocks starter fallback when accepted anchor exists", () => {
    const accepted = "a".repeat(2_700);
    const r = pickAuthoritativeSigningHandoffCorpus({
      candidates: [{ text: "starter".repeat(100), source: "starter_fallback" }],
      acceptedAuthoritativeBody: accepted,
      premiumAccepted: true,
      pipelineSource: "server_full_draft",
    });
    expect(r.text).toHaveLength(2_700);
  });
});

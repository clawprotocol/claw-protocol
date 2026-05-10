import { describe, expect, it } from "vitest";
import { stripClausePreambleFromRevisedPair, stripRecipientQaDraftNoiseLines } from "./recipientRevisionPreambleStrip";

describe("stripClausePreambleFromRevisedPair", () => {
  it("strips LLM-style preamble before the first numbered clause on both sides", () => {
    const head =
      "This revised draft reflects the following sections and key changes below. The summary is not contract body.\n\n";
    const prop =
      `${head}1.1 Services\nThe vendor will perform professional services.\n\n2.1 Project Timing\nWork begins on schedule.`;
    const cur =
      "Preamble in baseline that is long enough to not match meta strip.\n\n1.1 Services\nOld services.\n\n2.1 Project Timing\nOld timing.";
    const r = stripClausePreambleFromRevisedPair(cur, prop);
    expect(r.proposedPlain.startsWith("1.1 Services")).toBe(true);
    expect(r.proposedPlain).not.toContain("revised draft reflects");
    expect(r.currentPlain).toContain("1.1 Services");
  });

  it("returns originals when no meta preamble is detected", () => {
    const cur = "1.1 Services\nAlpha.";
    const prop = "1.1 Services\nBeta.";
    const r = stripClausePreambleFromRevisedPair(cur, prop);
    expect(r).toEqual({ currentPlain: cur, proposedPlain: prop });
  });
});

describe("stripRecipientQaDraftNoiseLines", () => {
  it("removes Sarah Collins QA cover lines and standalone page labels", () => {
    const raw = [
      "Sarah Collins proposed revised draft for QA testing - Page 1",
      "Prepared as Sarah Collins proposed revised agreement draft for LawDog QA.",
      "This is a clean revised draft, not a signed agreement.",
      "",
      "Page 2",
      "1.0 Summary",
      "This revised draft reflects payment clarifications.",
    ].join("\n");
    const out = stripRecipientQaDraftNoiseLines(raw);
    expect(out).toContain("1.0 Summary");
    expect(out).not.toMatch(/Sarah Collins proposed revised draft for QA testing/i);
    expect(out).not.toMatch(/Prepared as Sarah Collins/i);
    expect(out).not.toMatch(/^Page 2$/m);
  });
});

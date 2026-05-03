import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("SimpleDonePage review-link receipt", () => {
  it("shows review handoff section, per-recipient copy, public verify label, and recovery copy", () => {
    const p = join(__dirname, "SimpleDonePage.tsx");
    const s = readFileSync(p, "utf8");
    expect(s).toContain("Review links to share");
    expect(s).toContain("readSimpleDoneReviewRecipientLinks");
    expect(s).toContain("Copy public verify link");
    expect(s).toContain("Copy ${row.displayName} review link");
    expect(s).toContain("Review links were created, but this page could not load them");
    expect(s).toContain("/app/send/");
  });
});

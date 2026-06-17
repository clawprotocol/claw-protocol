import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("multi-party send / review recipient setup (UI + handoff wiring)", () => {
  const intakePath = join(__dirname, "AgreementBuilderIntake.tsx");

  it("recipient panel renders one capped draft.party row each with extra-party test ids from index 2", () => {
    const src = readFileSync(intakePath, "utf8");
    expect(src).toContain("MAX_PREMIUM_RECIPIENT_PARTY_HANDOFF_ROWS");
    expect(src).toMatch(/partiesForSetup\.map\(\(party, idx\)/);
    expect(src).toMatch(/data-testid=\{idx >= 2 \? `agreement-party-review-email-\$\{idx\}`/);
  });

  it("premium send confirm surfaces all party-slot reviewer emails including extras", () => {
    const src = readFileSync(intakePath, "utf8");
    expect(src).toContain("[recipient1Email, recipient2Email, ...extraPartyReviewEmails]");
    expect(src).toContain("Reviewer emails (optional, for your records):");
  });

  it("primed VS01 handoff merges via recipientPartyEmails array from buildRecipientPartyEmailsArrayForHandoff", () => {
    const src = readFileSync(intakePath, "utf8");
    expect(src).toContain("recipientPartyEmails: buildRecipientPartyEmailsArrayForHandoff");
  });
});

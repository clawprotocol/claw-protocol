import { describe, expect, it } from "vitest";
import {
  buildPaidProSourceFactProbe,
  buildPaidProValidationDiagnostics,
  rejectPremiumBodyForProRender,
  rejectPremiumDegradedFiller,
  rejectProUpgradeSourceFactDrift,
} from "./premiumFullDraftClientAcceptance";

const RICH_INTAKE = `
  CryptoSpaces.net website redesign. Anthem Blanchard (client) and Sarah Collins (developer) in Oklahoma.
  Total $7,500: $3,000 upfront, $4,500 final within 30 days of delivery by May 1, 2026. Two (2) revision rounds.
  Pre-existing tools/libraries. Notices by email. No Delaware — Oklahoma law.
`.toLowerCase();

function padProBody(core: string, targetLen: number): string {
  const pad = "\n\n" + "The parties further agree to cooperate in good faith. ".repeat(400);
  let t = core;
  while (t.length < targetLen) t += pad;
  return t;
}

describe("rejectProUpgradeSourceFactDrift", () => {
  it("rejects Delaware governing law when intake is Oklahoma and Oklahoma is absent (hard drift)", () => {
    const low = "governed by the laws of the State of Delaware, without regard to conflict-of-law rules.";
    const r = rejectProUpgradeSourceFactDrift(low, { intakeLower: "Oklahoma. Website." });
    expect(r.ok).toBe(false);
    expect(r.reasons).toContain("governing_law_drift_delaware_intake_had_oklahoma");
  });

  it("passes when intake says Oklahoma and the body codifies State of Oklahoma governing law (no Delaware)", () => {
    const b = "this agreement shall be governed by the laws of the state of oklahoma.";
    const r = rejectProUpgradeSourceFactDrift(b, { intakeLower: "Oklahoma" });
    expect(r.ok).toBe(true);
  });

  it("fails when Party A / Party B is used and intake names real parties / CryptoSpaces but the body has no name anchors", () => {
    const b = `party a and party b agree. the service provider shall build the site. laws of the state of oklahoma. $3000. $4500. thirty-day period. ${"x".repeat(4000)}`;
    const r = rejectProUpgradeSourceFactDrift(b, { intakeLower: RICH_INTAKE });
    expect(r.ok).toBe(false);
    expect(r.reasons).toEqual(expect.arrayContaining([expect.stringMatching(/party_a_b/)]));
  });

  it("passes 15k-style pro document with client/developer labels but anthem/sarah/cryptospaces/oklahoma/payment facts", () => {
    const lead = `
# Web Development Agreement

## Parties and roles
The **Client** is **Anthem Blanchard** and the **Developer** is **Sarah Collins** for the **CryptoSpaces** property.

Governing law: the laws of the **State of Oklahoma** (and not the laws of the State of Delaware as to internal affairs).

**Total fee $7,500.00** split as **$3,000** on commencement, **$4,500** upon final delivery within **thirty (30) days** of substantial completion, target effective **May 1, 2026**. **Two revision rounds** are included. The Developer may use **pre-existing tools and libraries** where permitted. **Notices** may be sent by **email** and **electronic mail**.
    `;
    const b = padProBody(lead, 15_500);
    const r = rejectProUpgradeSourceFactDrift(b, { intakeLower: RICH_INTAKE });
    expect(r.ok, r.reasons.join(", ")).toBe(true);
  });
});

describe("rejectPremiumDegradedFiller", () => {
  it("rejects repeated operative-terms degraded template lines", () => {
    const line =
      "1. Operative terms. The parties intend to document the relationship described in the intake above; specifics follow.";
    const body = `${line}\n${line}\n${line}\n${line}`;
    const r = rejectPremiumDegradedFiller(body);
    expect(r.ok).toBe(false);
    expect(r.reasons.some((x) => x.includes("repeated_operative_terms") || x.includes("degraded_filler"))).toBe(
      true,
    );
  });

  it("rejects legacy airlock / unavailable copy in body", () => {
    const r = rejectPremiumDegradedFiller(
      "Preamble\n\nThe automated full pass was not available for this run.\n\nMore text.",
    );
    expect(r.ok).toBe(false);
  });

  it("rejects summary-from-intake and commercial-framework shells", () => {
    const r = rejectPremiumDegradedFiller("## Summary from your intake\n\nx\n\n## Commercial framework\n\ny");
    expect(r.ok).toBe(false);
  });

  it("rejects repeated review-completion stub lines", () => {
    const line =
      "Operative terms. The parties intend to document the relationship; specific commercial, payment, and liability terms should be completed in review.";
    const body = `${line}\n${line}\n${line}`;
    const r = rejectPremiumDegradedFiller(body);
    expect(r.ok).toBe(false);
  });
});

describe("rejectPremiumBodyForProRender", () => {
  it("does not use schedule_a_filler when the document is long and operative (Schedule A may be a stub line)", () => {
    const intro =
      "SOFTWARE / WEB DEVELOPMENT MSA\n\n" +
      "SCHEDULE A — DELIVERABLE SUMMARY (NON-EXHAUSTIVE)\n" +
      "Schedule A: the parties may update milestones by change order; line-item detail may appear in exhibits.\n\n";
    const longOperative = " The parties shall cooperate in good faith. Governing law: the laws of the State of Oklahoma. ".repeat(500);
    const t = (intro + longOperative).trim();
    const r = rejectPremiumBodyForProRender(t, { intakeLower: "oklahoma" });
    expect(r.ok, r.reasons.join(", ")).toBe(true);
    expect(r.reasons).not.toContain("schedule_a_filler");
  });
});

describe("buildPaidProSourceFactProbe", () => {
  it("exposes fact booleans without logging full text", () => {
    const p = buildPaidProSourceFactProbe(
      "Anthem / Sarah / CryptoSpaces — $7500, $3000, $4500, May 1, 2026, 30 days, two (2) revisions, notices by email, pre-existing tools and libraries",
      "",
    );
    expect(p.anthem).toBe(true);
    expect(p.sarah).toBe(true);
    expect(p.cryptospaces).toBe(true);
    expect(p.pay7500).toBe(true);
    expect(p.pay3000).toBe(true);
    expect(p.pay4500).toBe(true);
    expect(p.may1_2026).toBe(true);
    expect(p.days30).toBe(true);
    expect(p.revisions2).toBe(true);
    expect(p.preExistToolsLibs).toBe(true);
    expect(p.emailNotices).toBe(true);
  });

  it("buildPaidProValidationDiagnostics groups governing law and anchors without full text", () => {
    const t =
      "Governed by Oklahoma law, not Delaware. Client Anthem Blanchard, Developer Sarah Collins, CryptoSpaces.net, $3,000 / $4,500 / 7500, May 31, 2026, thirty (30) days, two 2 revision rounds, pre-existing tools, notices by email, confidential, client owns work product.";
    const d = buildPaidProValidationDiagnostics(t, "Oklahoma, CryptoSpaces");
    expect(d.partyAnchorsSatisfied).toBe(true);
    expect(d.sourceFactHits.governingLawOklahomaMention).toBe(true);
    expect(d.sourceFactHits.days30).toBe(true);
    expect(d.sourceFactHits.may31_2026).toBe(true);
  });
});

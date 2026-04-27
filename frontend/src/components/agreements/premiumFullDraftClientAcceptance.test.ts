import { describe, expect, it } from "vitest";
import { buildPaidProSourceFactProbe, rejectProUpgradeSourceFactDrift } from "./premiumFullDraftClientAcceptance";

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
});

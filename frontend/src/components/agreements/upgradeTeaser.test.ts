import { describe, expect, it } from "vitest";
import {
  detectUpgradeIntentSignals,
  getUpgradeTeaser,
  resolveUpgradePartyCount,
  resolveUpgradeTeaserAgreementType,
  UPGRADE_TEASER_COLLABORATION_BULLET,
} from "./upgradeTeaser";

describe("getUpgradeTeaser", () => {
  it("returns LLC base with risk line and caps bullets at 3", () => {
    const r = getUpgradeTeaser({
      agreementType: "LLC",
      intentSignals: [],
      partyCount: 2,
    });
    expect(r.title).toContain("money and control");
    expect(r.bullets).toHaveLength(3);
    expect(r.bullets[0]).toBe(UPGRADE_TEASER_COLLABORATION_BULLET);
    expect(r.bullets[1]).toBe("Profit distribution tied to ownership");
    expect(r.riskLine).toContain("ownership");
  });

  it("leaves NDA and Contractor risk lines empty per base templates", () => {
    expect(getUpgradeTeaser({ agreementType: "NDA", intentSignals: [], partyCount: 2 }).riskLine).toBe("");
    expect(getUpgradeTeaser({ agreementType: "Contractor", intentSignals: [], partyCount: 2 }).riskLine).toBe("");
  });

  it("keeps universal collaboration first when intent fills capacity", () => {
    const r = getUpgradeTeaser({
      agreementType: "LLC",
      intentSignals: ["profit", "exit", "voting", "liability"],
      partyCount: 4,
    });
    expect(r.bullets).toHaveLength(3);
    expect(r.bullets[0]).toBe(UPGRADE_TEASER_COLLABORATION_BULLET);
    expect(r.bullets[1]).toBe("How payments are calculated and enforced");
    expect(r.bullets[2]).toBe("Exit terms and buyout structure");
  });

  it("inserts multi-party bullet after intent when partyCount > 2", () => {
    const r = getUpgradeTeaser({
      agreementType: "NDA",
      intentSignals: ["profit"],
      partyCount: 3,
    });
    expect(r.bullets).toEqual([
      UPGRADE_TEASER_COLLABORATION_BULLET,
      "How payments are calculated and enforced",
      "Roles and protections across multiple parties",
    ]);
  });

  it("does not add multi-party bullet when partyCount is 2", () => {
    const r = getUpgradeTeaser({
      agreementType: "Contractor",
      intentSignals: [],
      partyCount: 2,
    });
    expect(r.bullets[0]).toBe(UPGRADE_TEASER_COLLABORATION_BULLET);
    expect(r.bullets).not.toContain("Roles and protections across multiple parties");
  });
});

describe("detectUpgradeIntentSignals", () => {
  it("detects profit and voting phrasing", () => {
    expect(
      detectUpgradeIntentSignals(
        "We need profit distribution tied to units and unanimous consent on major decisions.",
      ),
    ).toEqual(["profit", "voting"]);
  });

  it("detects exit and liability", () => {
    expect(
      detectUpgradeIntentSignals("Include a buyout clause and limitation of liability capped at fees paid."),
    ).toEqual(["exit", "liability"]);
  });
});

describe("resolveUpgradeTeaserAgreementType", () => {
  it("maps operating agreement family to LLC", () => {
    expect(resolveUpgradeTeaserAgreementType("operating_agreement", "default")).toBe("LLC");
  });

  it("maps nda flow", () => {
    expect(resolveUpgradeTeaserAgreementType("nda", "nda")).toBe("NDA");
  });

  it("defaults other flows to Contractor", () => {
    expect(resolveUpgradeTeaserAgreementType("generic_business_agreement", "consulting")).toBe("Contractor");
  });
});

describe("resolveUpgradePartyCount", () => {
  it("uses max of draft parties and parties line", () => {
    expect(
      resolveUpgradePartyCount({ parties: [{}, {}, {}] }, "A and B"),
    ).toBe(3);
  });

  it("infers count from and-chained parties line", () => {
    expect(resolveUpgradePartyCount(null, "Acme LLC and Beta LLC and Gamma LLC")).toBe(3);
  });
});

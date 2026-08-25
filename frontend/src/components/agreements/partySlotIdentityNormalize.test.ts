import { describe, expect, it } from "vitest";
import { extractBetweenPartyNameList, extractBetweenPartyNameListForAuthority } from "./partyBetweenParse";
import {
  collapseDraftPartyRows,
  collapsePartySlotCandidates,
  isInvalidPartySlotLegalEntity,
  isStandaloneLegalEntitySuffix,
  normalizeAgreementPartyName,
  resolveAuthoritativeIntakePartyNames,
  resolveDeclaredExplicitPartyCount,
  splitCommaSeparatedPartyNames,
} from "./partySlotIdentityNormalize";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST330_BETWEEN =
  'between Red Mesa Logistics, LLC ("party_a") and Harbor Peak Automation, LLC ("party_b")';

describe("partySlotIdentityNormalize", () => {
  it("rejects standalone LLC as a legal entity", () => {
    expect(isStandaloneLegalEntitySuffix("LLC")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("LLC")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("party_a")).toBe(true);
    expect(isInvalidPartySlotLegalEntity(RED_MESA)).toBe(false);
  });

  it("normalizes comma-before-suffix entity names", () => {
    expect(normalizeAgreementPartyName("Red Mesa Logistics, LLC")).toBe(RED_MESA);
    expect(normalizeAgreementPartyName('Harbor Peak Automation, LLC ("party_b")')).toBe(HARBOR_PEAK);
  });

  it("splitCommaSeparatedPartyNames keeps Entity, LLC as one party", () => {
    expect(splitCommaSeparatedPartyNames("Red Mesa Logistics, LLC")).toEqual([RED_MESA]);
    expect(splitCommaSeparatedPartyNames("Acme LLC, Beta Inc")).toEqual(["Acme LLC", "Beta Inc"]);
  });

  it("extractBetweenPartyNameList resolves test330 intake to exactly two parties", () => {
    const names = extractBetweenPartyNameList(TEST330_BETWEEN);
    expect(names).toEqual([RED_MESA, HARBOR_PEAK]);
    expect(collapsePartySlotCandidates(names)).toEqual([RED_MESA, HARBOR_PEAK]);
  });

  it("Alex Rivera / PixelForge sole-prop intake resolves to exactly two parties", () => {
    const intake =
      "I need a simple services agreement between me (Alex Rivera, freelance product designer) " +
      "and a small startup called PixelForge Labs. I'm going to design their new mobile app UI " +
      "for the next 6 weeks. Flat fee of $4,500.";
    expect(extractBetweenPartyNameList(intake)).toEqual(["Alex Rivera", "PixelForge Labs"]);
    expect(extractBetweenPartyNameListForAuthority(intake)).toEqual([
      "Alex Rivera",
      "PixelForge Labs",
    ]);
    expect(resolveAuthoritativeIntakePartyNames(intake)).toEqual([
      "Alex Rivera",
      "PixelForge Labs",
    ]);
  });

  it("four-party bullet intake does not promote list markers or drop Blue Harbor", () => {
    const intake = [
      "Draft a four-party Professional Services Agreement among:",
      "* Redwood Biologics, Inc. (Client)",
      "* Summit AI Consulting LLC (Lead Provider)",
      "* Blue Harbor Systems LLC (Implementation Partner)",
      "* Iron Gate Security LLC (Cybersecurity Auditor)",
    ].join("\n");
    const names = resolveAuthoritativeIntakePartyNames(intake);
    expect(names.some((n) => /^\s*[-*•]/.test(n))).toBe(false);
    expect(names.map((n) => n.toLowerCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim())).toEqual([
      "redwood biologics inc",
      "summit ai consulting llc",
      "blue harbor systems llc",
      "iron gate security llc",
    ]);
    expect(normalizeAgreementPartyName("* Summit AI Consulting LLC")).toBe("Summit AI Consulting LLC");
  });

  it("four-party oxford comma between list", () => {
    const intake =
      "Services agreement between Acme LLC, Beta Inc, Gamma Studios, and Delta Holdings. Fee $7,500/month. Term 12 months.";
    const names = extractBetweenPartyNameListForAuthority(intake);
    expect(names.length).toBe(4);
  });

  it("preserves five-party Oxford comma intake lists", () => {
    const intake =
      "Need an agreement between Ironclad Systems Group LLC, Harborline Data Solutions Inc., Northwind Automation Partners LLC, Silver Mesa Analytics LP, and VertexGrid Technologies LLC for a joint AI rollout.";
    expect(extractBetweenPartyNameList(intake)).toHaveLength(5);
  });

  it("rejects service-scope deliverables mistaken for legal entities", () => {
    expect(isInvalidPartySlotLegalEntity("implementation support")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("process documentation")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("configuration assistance")).toBe(true);
    expect(isInvalidPartySlotLegalEntity("training services")).toBe(true);
    expect(isInvalidPartySlotLegalEntity(RED_MESA)).toBe(false);
  });

  it("collapseDraftPartyRows repairs three-row draft with standalone LLC slot", () => {
    const collapsed = collapseDraftPartyRows(
      [
        { name: "Red Mesa Logistics", role: "party_a" },
        { name: "LLC", role: "party_b" },
        { name: "Harbor Peak Automation", role: "party" },
      ],
      TEST330_BETWEEN,
    );
    expect(collapsed).toHaveLength(2);
    expect(collapsed[0]?.name).toBe(RED_MESA);
    expect(collapsed[1]?.name).toBe(HARBOR_PEAK);
  });

  it("among Alpha/Beta/Gamma keeps appearance order even when Beta's name is longer", () => {
    const alpha = "Alpha Services LLC";
    const beta = "Beta Operations LLC";
    const gamma = "Gamma Holdings LLC";
    expect(beta.length).toBeGreaterThan(alpha.length);
    const names = resolveAuthoritativeIntakePartyNames(
      `Services agreement among ${alpha}, ${beta}, and ${gamma}.`,
    );
    expect(names).toEqual([alpha, beta, gamma]);
    expect(new Set(names).size).toBe(3);
  });

  it("two-party between-clause order is unchanged when Party 2 is longer", () => {
    const shorter = "Acme LLC";
    const longer = "Harbor Peak Automation LLC";
    expect(longer.length).toBeGreaterThan(shorter.length);
    expect(resolveAuthoritativeIntakePartyNames(`Agreement between ${shorter} and ${longer}.`)).toEqual([
      shorter,
      longer,
    ]);
  });

  it("recognizes conservative explicit numeric and word-form party declarations", () => {
    expect(
      resolveDeclaredExplicitPartyCount(
        "Provide an NDA for 3 parties using Texas law for proprietary IP for the statutory limit",
      ),
    ).toBe(3);
    expect(resolveDeclaredExplicitPartyCount("Provide an NDA for three parties using Texas law")).toBe(3);
    expect(resolveDeclaredExplicitPartyCount("Need an NDA among 3 parties for proprietary IP")).toBe(3);
    expect(resolveDeclaredExplicitPartyCount("Need a three-party NDA under Texas law")).toBe(3);
    expect(resolveDeclaredExplicitPartyCount("Need a 3-party NDA under Texas law")).toBe(3);
    expect(resolveDeclaredExplicitPartyCount("Need an NDA for 4 parties using Texas law")).toBe(4);
    expect(resolveDeclaredExplicitPartyCount("Need an NDA among 4 parties")).toBe(4);
    expect(resolveDeclaredExplicitPartyCount("Need a four-party brand license")).toBe(4);
    expect(resolveDeclaredExplicitPartyCount("Need a 4-party joint venture")).toBe(4);
    expect(resolveDeclaredExplicitPartyCount("Consulting agreement between Acme LLC and Beta Corp.")).toBeNull();
  });
});

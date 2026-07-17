import { describe, expect, it } from "vitest";
import { extractBetweenPartyNameList, extractBetweenPartyNameListForAuthority } from "./partyBetweenParse";
import {
  collapseDraftPartyRows,
  collapsePartySlotCandidates,
  isInvalidPartySlotLegalEntity,
  isStandaloneLegalEntitySuffix,
  normalizeAgreementPartyName,
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
});

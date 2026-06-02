import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  countIdentityPlaceholders,
  inferOrgSlotOriginMetadata,
  listUnresolvedIdentityPlaceholderTokens,
  logPaidProEntityMap,
  logPaidProPlaceholderOrigin,
  logPaidProPlaceholderRepair,
  resetPaidProPlaceholderAttributionLogsForTests,
} from "./paidProPlaceholderAttributionLog";
import { repairKnownPartyPlaceholders } from "../../agreement/partyPlaceholderDisplay";

describe("paidProPlaceholderAttributionLog", () => {
  beforeEach(() => {
    resetPaidProPlaceholderAttributionLogsForTests();
    vi.unstubAllEnvs();
  });

  it("does not console.log in test mode", () => {
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProPlaceholderOrigin({
      placeholder: "[ORG_3]",
      sourceModule: "test",
      sourceEntityType: "extra_org_slot",
      sourceValue: "3",
    });
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("infers ORG_3/ORG_4 as extra slots beyond two canonical parties", () => {
    expect(inferOrgSlotOriginMetadata("[ORG_1]", 2).sourceEntityType).toBe("contracting_party_slot");
    expect(inferOrgSlotOriginMetadata("[ORG_3]", 2).sourceEntityType).toBe(
      "extra_org_slot_likely_notice_or_affiliate",
    );
    expect(inferOrgSlotOriginMetadata("[ORG_4]", 2).sourceEntityType).toBe(
      "extra_org_slot_likely_subsidiary_or_contact",
    );
  });

  it("counts and lists unresolved identity placeholders", () => {
    const text = "Between [ORG_1] and [ORG_2] with notice to [ORG_3] and Smith & [ORG_4].";
    expect(countIdentityPlaceholders(text)).toBe(4);
    expect(listUnresolvedIdentityPlaceholderTokens(text)).toEqual(
      expect.arrayContaining(["[ORG_1]", "[ORG_3]", "[ORG_4]"]),
    );
  });

  it("repairKnownPartyPlaceholders leaves ORG_3/ORG_4 when only two parties are known", () => {
    const text =
      'Between [ORG_1] ("Client") and [ORG_2] ("Service Provider"). Notice copy for [ORG_3] and Smith & [ORG_4].';
    const out = repairKnownPartyPlaceholders(text, ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."], "");
    expect(out.repairedSlots).toEqual([1, 2]);
    expect(out.text).not.toMatch(/\[ORG_1\]|\[ORG_2\]/);
    expect(out.text).toMatch(/\[ORG_3\]/);
    expect(out.text).toMatch(/\[ORG_4\]/);
    expect(out.hasRemainingIdentityPlaceholder).toBe(true);
  });

  it("emits structured logs in DEV mode", () => {
    vi.stubEnv("MODE", "development");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    logPaidProPlaceholderRepair({
      sourceModule: "repairAgreementTemplatePlaceholders",
      beforeCount: 4,
      afterCount: 2,
      unresolvedPlaceholders: ["[ORG_3]", "[ORG_4]", "to be completed"],
    });
    logPaidProEntityMap({
      sourceModule: "canonicalPartyIdentityResolver",
      organizations: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
      signers: [],
      noticeRecipients: [],
      affiliates: [],
    });
    expect(spy).toHaveBeenCalledWith(
      "[paid-pro-placeholder-repair]",
      expect.objectContaining({ unresolvedPlaceholders: ["[ORG_3]", "[ORG_4]", "to be completed"] }),
    );
    expect(spy).toHaveBeenCalledWith(
      "[paid-pro-entity-map]",
      expect.objectContaining({ organizations: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."] }),
    );
    spy.mockRestore();
  });

  it("deduplicates identical entity-map logs per source", () => {
    vi.stubEnv("MODE", "development");
    const spy = vi.spyOn(console, "info").mockImplementation(() => {});
    const payload = {
      sourceModule: "canonicalPartyIdentityResolver",
      organizations: ["Blue Canyon Analytics LLC", "Iron Vale Systems Inc."],
      signers: [] as string[],
      noticeRecipients: [] as string[],
      affiliates: [] as string[],
    };
    logPaidProEntityMap(payload);
    logPaidProEntityMap(payload);
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});

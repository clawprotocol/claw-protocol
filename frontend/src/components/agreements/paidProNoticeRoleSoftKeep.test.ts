import { describe, expect, it } from "vitest";
import { PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN } from "./premiumAcceptancePolicy";
import {
  isNoticeRoleSoftVpaidReasons,
  shouldKeepWireDespiteNoticeRoleFreezeReject,
} from "./paidProNoticeRoleSoftKeep";

describe("paidProNoticeRoleSoftKeep (live Mike-paint 2026-08-21)", () => {
  const liveVpaidReasons = [
    "notice_stanza_role_corruption",
    "substantive_server_draft_recovery_blocked",
  ];

  it("keeps the live 12k ok body without IN WITNESS WHEREOF", () => {
    expect(isNoticeRoleSoftVpaidReasons(liveVpaidReasons)).toBe(true);
    expect(
      shouldKeepWireDespiteNoticeRoleFreezeReject({
        freezeReject: "notice_stanza_role_corruption",
        docLen: 12182,
        minLen: PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
      }),
    ).toBe(true);
  });

  it("does not keep when notice role is not among the reasons", () => {
    expect(isNoticeRoleSoftVpaidReasons(["substantive_server_draft_recovery_blocked"])).toBe(
      false,
    );
    expect(
      shouldKeepWireDespiteNoticeRoleFreezeReject({
        freezeReject: "duplicate_provision_family",
        docLen: 12182,
        minLen: PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
      }),
    ).toBe(false);
  });

  it("does not keep a thin body", () => {
    expect(
      shouldKeepWireDespiteNoticeRoleFreezeReject({
        freezeReject: "notice_stanza_role_corruption",
        docLen: 937,
        minLen: PARSE_DEGRADED_PAID_AUTHORITATIVE_MIN_LEN,
      }),
    ).toBe(false);
  });
});

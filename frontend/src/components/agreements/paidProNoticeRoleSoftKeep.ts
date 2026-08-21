/** Soft-keep a finished Pro body when notices use role names instead of Client.

Live Mike-paint (2026-08-21, bundle index-Ltv4F1Gt.js): generate returned
12,182 chars, generation_outcome=ok. Client rejected freeze for
notice_stanza_role_corruption (If to Service Provider / If to Mike) plus
substantive_server_draft_recovery_blocked. No IN WITNESS WHEREOF. The #51
keep required witness + only one vPaid reason, so the 12k body was wiped
to Retry Pro draft.
*/
export function isNoticeRoleSoftVpaidReasons(reasons: readonly string[]): boolean {
  if (reasons.length === 0) return false;
  return (
    reasons.every(
      (r) =>
        /notice_stanza_role_corruption/i.test(r) ||
        /substantive_server_draft_recovery_blocked/i.test(r),
    ) && reasons.some((r) => /notice_stanza_role_corruption/i.test(r))
  );
}

export function shouldKeepWireDespiteNoticeRoleFreezeReject(args: {
  freezeReject: string;
  docLen: number;
  minLen: number;
}): boolean {
  return (
    /notice_stanza_role_corruption/i.test(args.freezeReject) &&
    args.docLen >= args.minLen
  );
}

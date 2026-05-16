/** Safe short ids for premium upgrade logs (never full UUIDs in prod console). */
export function shortIdForPremiumLog(id: string | null | undefined): string | null {
  const t = (id ?? "").trim();
  if (!t) return null;
  return t.length <= 12 ? t : `${t.slice(0, 8)}…`;
}

export function logPremiumSessionConsistency(args: {
  context: string;
  agreementId?: string | null;
  agreementGenerationId?: string | null;
  intakeFingerprint?: string | null;
}): void {
  if (import.meta.env.MODE === "test") return;
  // eslint-disable-next-line no-console
  console.info("[premium-session-consistency]", {
    context: args.context,
    agreementIdShort: shortIdForPremiumLog(args.agreementId),
    sessionGenerationIdShort: shortIdForPremiumLog(args.agreementGenerationId),
    intakeFingerprint: args.intakeFingerprint ?? null,
  });
}

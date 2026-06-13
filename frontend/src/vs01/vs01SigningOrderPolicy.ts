/**
 * VS01 signing order policy. Production default is parallel — every signer may sign immediately.
 * Ordered sender-first is opt-in only (future setting / QA).
 */
export const VS01_SENDER_FIRST_LOCAL_STORAGE_KEY = "lawdogVs01SenderFirst";

export function isVs01SenderFirstSigningExplicitlyEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(VS01_SENDER_FIRST_LOCAL_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Default false — parallel signing unless explicitly opted in. */
export function resolveVs01SenderMustSignFirst(override?: boolean): boolean {
  if (override === true) return true;
  if (override === false) return false;
  return isVs01SenderFirstSigningExplicitlyEnabled();
}

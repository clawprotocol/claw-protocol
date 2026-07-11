import { readAnonymousSessionToken } from "./anonymousSessionApi";

export const ANON_SESSION_HEADER = "X-Claw-Anon-Session";

export function anonymousSessionHeaders(): Record<string, string> {
  const token = readAnonymousSessionToken();
  if (!token) return {};
  return { [ANON_SESSION_HEADER]: token };
}

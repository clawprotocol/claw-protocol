import { resolveApiBase } from "../../lib/clawApi";

export type PostProductSignupLegalAssentPayload = {
  assent_timestamp_iso: string;
  terms_version_id: string;
  privacy_version_id: string;
  legal_ack_version: number;
  user_ref?: string | null;
  org_id?: string | null;
  authenticated_user_id?: string | null;
  client_assent_id: string;
  auth_path: string;
  meta?: Record<string, unknown>;
};

export async function postProductSignupLegalAssent(
  payload: PostProductSignupLegalAssentPayload
): Promise<{ assent_id: string } | null> {
  try {
    const base = resolveApiBase().replace(/\/$/, "");
    const res = await fetch(`${base}/v1/compliance/product-signup-assent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    const j = (await res.json()) as { assent_id?: string };
    return j.assent_id ? { assent_id: j.assent_id } : null;
  } catch {
    return null;
  }
}

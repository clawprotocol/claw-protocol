import { apiUrl, errorMessageFromResponse, logClawClientWarning, readJson } from "../lib/clawApi";

export type DisclosureRecord = {
  key: string;
  version: string;
  title?: string;
  summary?: string;
  content_sha256: string;
};

export async function fetchComplianceDisclosureMap(): Promise<Record<string, DisclosureRecord> | null> {
  try {
    const res = await fetch(apiUrl("/v1/compliance/disclosures"), {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `disclosures HTTP ${res.status}`);
      logClawClientWarning("compliance.disclosures", { status: res.status, msg });
      return null;
    }
    const j = await readJson<{ disclosures?: Record<string, DisclosureRecord> }>(res);
    return j.disclosures && typeof j.disclosures === "object" ? j.disclosures : null;
  } catch (e) {
    logClawClientWarning("compliance.disclosures", { error: String(e) });
    return null;
  }
}

export type AcknowledgementBody = {
  disclosure_key: string;
  disclosure_version: string;
  disclosure_hash: string;
  org_id?: string;
  user_ref?: string;
  subject_type?: string;
  subject_id?: string;
};

export async function postComplianceAcknowledgement(
  body: AcknowledgementBody
): Promise<{ ok: true; acknowledgement_id: string } | { ok: false; error: string }> {
  try {
    const res = await fetch(apiUrl("/v1/compliance/acknowledgements"), {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const msg = await errorMessageFromResponse(res, `acknowledgement HTTP ${res.status}`);
      return { ok: false, error: msg };
    }
    const j = await readJson<{ ok?: boolean; acknowledgement_id?: string }>(res);
    if (j.ok && typeof j.acknowledgement_id === "string") {
      return { ok: true, acknowledgement_id: j.acknowledgement_id };
    }
    return { ok: false, error: "unexpected_ack_response" };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

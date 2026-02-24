import type { DraftState } from "../../components/AgreementBuilderChat";

export function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    Object.keys(obj)
      .sort()
      .forEach((k) => {
        out[k] = canonicalize(obj[k]);
      });
    return out;
  }
  return value ?? null;
}

export function toSignableDraftPayload(draft: DraftState): Record<string, unknown> {
  // private_notes intentionally excluded from signing payload
  return canonicalize({
    title: (draft.title || "").trim() || null,
    jurisdiction: (draft.jurisdiction || "").trim().toUpperCase() || null,
    parties: (draft.parties || []).map((p) => ({
      id: p.id || null,
      name: (p.name || "").trim() || null,
      role: (p.role || "party").trim() || "party",
      contact: (p.contact || "").trim() || null,
    })),
    body_md: (draft.body_md || "").trim() || null,
  }) as Record<string, unknown>;
}

export async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", encoded);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashDraftState(draft: DraftState): Promise<string> {
  const payload = toSignableDraftPayload(draft);
  return sha256Hex(JSON.stringify(payload));
}


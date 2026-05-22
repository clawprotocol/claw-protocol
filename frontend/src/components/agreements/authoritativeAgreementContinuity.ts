/**
 * Authoritative premium draft continuity — version id, shrink guards, recipient-metadata-only mutations.
 */

const VERSION_KEY = "claw_authoritative_agreement_version_v1";

export type AuthoritativeContinuitySnapshot = {
  versionId: string;
  bodyLen: number;
  title: string;
  capturedAt: number;
};

function newVersionId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `auth_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function bumpAuthoritativeAgreementVersion(bodyLen: number, title: string): AuthoritativeContinuitySnapshot {
  const snap: AuthoritativeContinuitySnapshot = {
    versionId: newVersionId(),
    bodyLen,
    title: (title || "").trim(),
    capturedAt: Date.now(),
  };
  try {
    sessionStorage.setItem(VERSION_KEY, JSON.stringify(snap));
  } catch {
    /* ignore */
  }
  if (import.meta.env.DEV) {
    // eslint-disable-next-line no-console
    console.info("[authoritative-agreement-version]", snap);
  }
  return snap;
}

export function readAuthoritativeAgreementVersion(): AuthoritativeContinuitySnapshot | null {
  try {
    const raw = sessionStorage.getItem(VERSION_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as AuthoritativeContinuitySnapshot;
    if (!o?.versionId) return null;
    return o;
  } catch {
    return null;
  }
}

export function assertAuthoritativeBodyContinuity(args: {
  label: string;
  previousLen: number;
  nextLen: number;
  allowShrinkRatio?: number;
}): void {
  const prev = args.previousLen;
  const next = args.nextLen;
  if (prev < 500 || next >= prev) return;
  const ratio = next / prev;
  const threshold = args.allowShrinkRatio ?? 0.72;
  if (ratio >= threshold) return;
  // eslint-disable-next-line no-console
  console.warn("[authoritative-body-shrink]", {
    label: args.label,
    previousLen: prev,
    nextLen: next,
    ratio: Number(ratio.toFixed(3)),
    versionId: readAuthoritativeAgreementVersion()?.versionId ?? null,
  });
}

export function logRecipientMetadataOnlyMutation(args: {
  agreementId?: string;
  fields: string[];
}): void {
  // eslint-disable-next-line no-console
  console.info("[recipient-metadata-only-mutation]", {
    agreementIdShort: (args.agreementId || "").slice(0, 8) || null,
    versionId: readAuthoritativeAgreementVersion()?.versionId ?? null,
    fields: args.fields,
  });
}

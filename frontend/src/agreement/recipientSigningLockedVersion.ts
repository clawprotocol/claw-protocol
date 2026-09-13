import type { AgreementDraft } from "./agreementTypes";
import type { AgreementVersionBundle } from "./agreementVersionStore";
import type { RecipientReviewAuthorityMeta } from "./recipientReviewAuthorityMeta";

function coerceMetaField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Recipient-sign display only. Owner draft normalize must not carry signer
 * identity — that flips paid-owner /app/ready into signature send.
 */
export function overlayAuthorizedSignerIdentity(
  draft: AgreementDraft,
  rawDraft: unknown,
): AgreementDraft {
  if (!rawDraft || typeof rawDraft !== "object") return draft;
  const rawParties = (rawDraft as { parties?: unknown }).parties;
  if (!Array.isArray(rawParties) || !draft.parties.length) return draft;
  const byId = new Map<string, { signerName?: string; signerTitle?: string }>();
  const byName = new Map<string, { signerName?: string; signerTitle?: string }>();
  for (const row of rawParties) {
    if (!row || typeof row !== "object") continue;
    const pr = row as Record<string, unknown>;
    const signerName = coerceMetaField(pr.signerName || pr.signer_name);
    const signerTitle = coerceMetaField(pr.signerTitle || pr.signer_title);
    if (!signerName && !signerTitle) continue;
    const meta = {
      ...(signerName ? { signerName } : {}),
      ...(signerTitle ? { signerTitle } : {}),
    };
    const id = coerceMetaField(pr.id);
    const name = coerceMetaField(pr.name).toLowerCase();
    if (id) byId.set(id, meta);
    if (name) byName.set(name, meta);
  }
  if (byId.size === 0 && byName.size === 0) return draft;
  return {
    ...draft,
    parties: draft.parties.map((party) => {
      const meta =
        (party.id && byId.get(party.id.trim())) || byName.get((party.name || "").trim().toLowerCase());
      if (!meta) return party;
      return { ...party, ...meta };
    }),
  };
}

/**
 * Bind the token-authorized locked version id onto the recipient bundle.
 * Local version ids are not authority — the server lock is.
 */
export function remountBundleToLockedVersion(
  bundle: AgreementVersionBundle,
  lockedVersionId: string,
  renderedHtml: string,
): AgreementVersionBundle {
  const lv = lockedVersionId.trim();
  if (!lv) return bundle;
  const existing = bundle.versions.find((v) => v.id === lv);
  if (existing) {
    return {
      ...bundle,
      currentVersionId: lv,
      versions: bundle.versions.map((v) =>
        v.id === lv ? { ...v, rendered_html: renderedHtml || v.rendered_html } : v,
      ),
    };
  }
  const source =
    bundle.versions.find((v) => v.id === bundle.currentVersionId) || bundle.versions[0];
  if (!source) return bundle;
  const remounted = { ...source, id: lv, rendered_html: renderedHtml || source.rendered_html };
  return {
    ...bundle,
    currentVersionId: lv,
    versions: [remounted, ...bundle.versions.filter((v) => v.id !== source.id)],
  };
}

/**
 * Fail closed when the token lock version is missing or does not match server lock
 * authority. Review-snapshot digest is plain corpus; lock digest is the JSON signing
 * snapshot. After owner confirmation + lock they describe one paper, so encoding
 * mismatch must not render a valid invitation expired.
 */
export function signPaperAuthorityClosed(args: {
  tokenLockedVersionId: string;
  meta: RecipientReviewAuthorityMeta | null;
  lockSha?: string | null;
  snapSha?: string | null;
  acceptedSnapshotId?: string | null;
  acceptedSnapshotDigest?: string | null;
  authorityMode?: string | null;
  legacyPreCutover?: boolean | null;
}): boolean {
  const tokenLv = args.tokenLockedVersionId.trim();
  if (!tokenLv || !args.meta) return true;
  if (args.meta.lockedVersionId !== tokenLv) return true;
  const lockSha = String(args.lockSha || "").trim().toLowerCase();
  const snapSha = String(args.snapSha || "").trim().toLowerCase();
  const metaSha = String(args.meta.corpusSha256 || "").trim().toLowerCase();
  const boundId = String(args.acceptedSnapshotId || "").trim();
  const boundDigest = String(args.acceptedSnapshotDigest || "").trim().toLowerCase();
  const mode = String(args.authorityMode || "").trim();
  const explicitLegacy = args.legacyPreCutover === true;
  if (explicitLegacy) {
    if (snapSha && metaSha && snapSha !== metaSha) return true;
    if (lockSha && metaSha && lockSha === metaSha) return false;
    return false;
  }
  if (mode === "uploaded_final_pdf") {
    return false;
  }
  // Modern or unclassified: require server-bound snapshot. Never infer legacy from absent fields.
  if (!boundId || !/^[0-9a-f]{64}$/.test(boundDigest)) return true;
  if (args.meta.snapshotId && boundId !== args.meta.snapshotId) return true;
  if (snapSha && snapSha !== boundDigest) return true;
  if (metaSha && metaSha !== boundDigest) return true;
  if (snapSha && metaSha && snapSha !== metaSha) return true;
  return false;
}

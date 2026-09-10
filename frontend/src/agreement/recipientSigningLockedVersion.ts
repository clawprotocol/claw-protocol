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

/** Fail closed when the token lock, snapshot, and lock hash do not describe one paper. */
export function signPaperAuthorityClosed(args: {
  tokenLockedVersionId: string;
  meta: RecipientReviewAuthorityMeta | null;
  lockSha?: string | null;
  snapSha?: string | null;
}): boolean {
  const tokenLv = args.tokenLockedVersionId.trim();
  if (!tokenLv || !args.meta) return true;
  if (args.meta.lockedVersionId !== tokenLv) return true;
  const lockSha = String(args.lockSha || "").trim().toLowerCase();
  const snapSha = String(args.snapSha || "").trim().toLowerCase();
  if (lockSha && snapSha && lockSha !== snapSha) return true;
  if (lockSha && lockSha !== args.meta.corpusSha256) return true;
  if (snapSha && snapSha !== args.meta.corpusSha256) return true;
  return false;
}

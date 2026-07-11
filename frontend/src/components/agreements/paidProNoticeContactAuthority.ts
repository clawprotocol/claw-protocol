/**
 * Notice contact authority for paid Pro acceptance, SoT freeze, and display parity.
 * Ensures intake/signer contact values replace operative tokens before any authoritative freeze.
 */

import { PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES } from "./paidProNPartySignerSetup";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  ensureCanonicalNoticesSectionHeadingForFreeze,
  ensureOperativeIfToNoticeDelivery,
  ensureOperativeNoticeStanzaCountAuthorityAtFreeze,
  ensureOperativeNoticeStanzaEntityLinesAtFreeze,
  repairDuplicateOperativeNoticeStanzas,
  repairFusedNoticesHeadingToPriorClause,
  resolveNoticeStructuralValidationParties,
  trimOperativeNoticeStanzasToPartyCount,
} from "./paidProPartyNoticeDetails";
import { repairProfessionalCorpusContamination } from "./paidProProfessionalCorpusContamination";
import type { PaidProPartyRoleContext, PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { mergeLabeledPartyAuthorityIntoParties, mergeDraftSignerContactFieldsOntoParties } from "./paidProSignerMetadataAuthority";
import { manifestRecordsForPaidProAcceptance, isGenericPaidProAcceptanceManifestFallback } from "./paidProAcceptanceExecutionBlockInvariant";
import { resolveCanonicalPartyIdentitiesFromSources } from "./canonicalPartyIdentityResolver";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import {
  containsUnresolvedRenderTokens,
  enforceUserVisibleRenderTokenAuthority,
} from "./userVisibleRenderTokenAuthority";

export type PaidProNoticeContactAuthorityOpts = {
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  surface?: string;
  /** When true (default), unresolved tokens after authority repair block the caller. */
  blockOnUnresolved?: boolean;
  /** When set, use these parties instead of re-resolving (freeze must match validation parties). */
  authorityParties?: readonly PaidProSignerMetadataParty[];
  acceptedCorpus?: string | null;
};

/** One party list for notice repair and clause-family validation at freeze. */
export function resolvePaidProNoticeAuthorityPartiesForFreeze(args: {
  reviewParties?: readonly PaidProSignerMetadataParty[];
  draft?: ParsedDraftShape | null;
  intakeText?: string | null;
  acceptedCorpus?: string | null;
}): PaidProSignerMetadataParty[] {
  const intakeRaw = args.intakeText ?? null;
  const draftPartyNames = (args.draft?.parties ?? [])
    .map((p) => String(p?.name ?? "").trim())
    .filter(Boolean);
  const roleContext: PaidProPartyRoleContext = {
    intakeText: intakeRaw,
    draftPartyNames,
    acceptedCorpus: args.acceptedCorpus ?? null,
  };
  let parties = mergeDraftSignerContactFieldsOntoParties(
    resolvePartiesForReviewRender({ draft: args.draft ?? null, intakeText: intakeRaw }),
    args.draft ?? null,
  );
  const manifestRecords = manifestRecordsForPaidProAcceptance({
    draft: args.draft ?? null,
    intakeText: intakeRaw,
  });
  const manifestAuthoritative = manifestRecords.filter((r) =>
    isAuthoritativeLegalEntityName(r.fullLegalName),
  );
  if (
    manifestAuthoritative.length >= 3 &&
    parties.filter((p) => isAuthoritativeLegalEntityName(p.partyLegalName.trim())).length <
      manifestAuthoritative.length
  ) {
    const fromManifest = manifestAuthoritative.map((record, partyIndex) => ({
      partyIndex,
      partyLegalName: record.fullLegalName,
      signerEmail: "",
      signerName: (record.signerName?.trim() || "").trim(),
      signerTitle: (record.signerTitle?.trim() || "").trim(),
      partyAddress: (record.partyAddress?.trim() || "").trim(),
    }));
    parties = mergeDraftSignerContactFieldsOntoParties(
      mergeLabeledPartyAuthorityIntoParties(fromManifest, intakeRaw),
      args.draft ?? null,
    );
  }
  const authoritativeReviewPartyCount = parties.filter(
    (p) => p.partyLegalName.trim().length >= 2,
  ).length;
  if (authoritativeReviewPartyCount < 2) {
    const acceptedCorpus = args.acceptedCorpus?.trim() ?? "";
    if (acceptedCorpus) {
      const fromCorpus = resolveCanonicalPartyIdentitiesFromSources({
        rawIntake: intakeRaw,
        generatedBody: acceptedCorpus,
        starterNames: draftPartyNames,
      }).filter((record) => isAuthoritativeLegalEntityName(record.fullLegalName.trim()));
      if (fromCorpus.length >= 2) {
        parties = mergeDraftSignerContactFieldsOntoParties(
          fromCorpus.slice(0, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES).map((record, partyIndex) => ({
            partyIndex,
            partyLegalName: record.fullLegalName,
            signerEmail: "",
            signerName: (record.signerName?.trim() || "").trim(),
            signerTitle: (record.signerTitle?.trim() || "").trim(),
            partyAddress: (record.partyAddress?.trim() || "").trim(),
          })),
          args.draft ?? null,
        );
      }
    }
  }
  const authoritativePartyCountAfterCorpus = parties.filter((p) =>
    isAuthoritativeLegalEntityName(p.partyLegalName.trim()),
  ).length;
  if (
    authoritativePartyCountAfterCorpus < 2 &&
    manifestRecords.length >= 2 &&
    isGenericPaidProAcceptanceManifestFallback(manifestRecords)
  ) {
    parties = mergeDraftSignerContactFieldsOntoParties(
      manifestRecords.slice(0, PAID_PRO_SIGNER_SETUP_MAX_UI_PARTIES).map((record, partyIndex) => ({
        partyIndex,
        partyLegalName: record.fullLegalName,
        signerEmail: "",
        signerName: (record.signerName?.trim() || "").trim(),
        signerTitle: (record.signerTitle?.trim() || "").trim(),
        partyAddress: (record.partyAddress?.trim() || "").trim(),
      })),
      args.draft ?? null,
    );
  }
  const seed =
    args.reviewParties && args.reviewParties.length >= 2 ? [...args.reviewParties] : parties;
  return [...resolveNoticeStructuralValidationParties(seed, roleContext)];
}

/** Canonical notice authority at freeze — same parties/intake used for validation. */
export function finalizePaidProCanonicalNoticeAuthorityForFreeze(
  text: string,
  opts: {
    reviewParties?: readonly PaidProSignerMetadataParty[];
    draft?: ParsedDraftShape | null;
    intakeText?: string | null;
    surface?: string;
  },
): PaidProNoticeContactAuthorityResult {
  const parties = resolvePaidProNoticeAuthorityPartiesForFreeze({
    reviewParties: opts.reviewParties,
    draft: opts.draft ?? null,
    intakeText: opts.intakeText ?? null,
    acceptedCorpus: text,
  });
  return applyPaidProNoticeContactAuthority(text, {
    draft: opts.draft ?? null,
    intakeText: opts.intakeText ?? null,
    surface: opts.surface ?? "paid_pro_canonical_notice_freeze",
    blockOnUnresolved: true,
    authorityParties: parties,
    acceptedCorpus: text,
  });
}

export type PaidProNoticeContactAuthorityResult = {
  text: string;
  repairs: string[];
  ok: boolean;
  blocked: boolean;
};

export function applyPaidProNoticeContactAuthority(
  raw: string,
  opts?: PaidProNoticeContactAuthorityOpts,
): PaidProNoticeContactAuthorityResult {
  const surface = opts?.surface ?? "paid_pro_notice_contact_authority";
  const intakeRaw = opts?.intakeText ?? null;
  let parties =
    opts?.authorityParties && opts.authorityParties.length >= 2
      ? [...opts.authorityParties]
      : resolvePaidProNoticeAuthorityPartiesForFreeze({
          draft: opts?.draft ?? null,
          intakeText: intakeRaw,
          acceptedCorpus: opts?.acceptedCorpus ?? raw,
        });
  const repairs: string[] = [];
  let out = (raw || "").replace(/\r\n/g, "\n");
  const roleContext: PaidProPartyRoleContext = {
    intakeText: intakeRaw,
    draftPartyNames: (opts?.draft?.parties ?? [])
      .map((p) => String(p?.name ?? "").trim())
      .filter(Boolean),
    acceptedCorpus: opts?.acceptedCorpus ?? out,
  };

  const headingRepair = ensureCanonicalNoticesSectionHeadingForFreeze(out);
  if (headingRepair.repairs.length > 0) {
    out = headingRepair.text;
    repairs.push(...headingRepair.repairs);
  }

  if (parties.length >= 2) {
    const canonicalPartyCount = resolveAuthoritativeSignerCount({
      intakeText: intakeRaw,
      draftPartyNames: roleContext.draftPartyNames ?? undefined,
      manifestPartyCount: parties.length,
    }).count;
    const contaminationRepair = repairProfessionalCorpusContamination(out, {
      partyNames: parties.map((p) => p.partyLegalName),
      partyCount: canonicalPartyCount,
      signerNames: parties.map((p) => p.signerName),
    });
    if (contaminationRepair.repairs.length > 0) {
      out = contaminationRepair.text;
      repairs.push(...contaminationRepair.repairs);
    }
    const noticeDelivery = ensureOperativeIfToNoticeDelivery(out, parties, {
      ...roleContext,
      acceptedCorpus: out,
    });
    if (noticeDelivery.repairs.length > 0) {
      out = noticeDelivery.text;
      repairs.push(...noticeDelivery.repairs.map((r) => `notice:${r}`));
    }
    const noticeDedupe = repairDuplicateOperativeNoticeStanzas(
      out,
      canonicalPartyCount,
      parties.map((p) => p.partyLegalName),
    );
    if (noticeDedupe.repairs.length > 0) {
      out = noticeDedupe.text;
      repairs.push(...noticeDedupe.repairs);
    }
    const trimmed = trimOperativeNoticeStanzasToPartyCount(out, canonicalPartyCount);
    if (trimmed.repairs.length > 0) {
      out = trimmed.text;
      repairs.push(...trimmed.repairs);
    }
    const entityLines = ensureOperativeNoticeStanzaEntityLinesAtFreeze(out, parties, {
      ...roleContext,
      acceptedCorpus: out,
    });
    if (entityLines.repairs.length > 0) {
      out = entityLines.text;
      repairs.push(...entityLines.repairs.map((r) => `notice:${r}`));
    }
    const stanzaCount = ensureOperativeNoticeStanzaCountAuthorityAtFreeze(out, parties, {
      ...roleContext,
      acceptedCorpus: out,
    });
    if (stanzaCount.repairs.length > 0) {
      out = stanzaCount.text;
      repairs.push(...stanzaCount.repairs);
    }
  }

  const tokenGate = enforceUserVisibleRenderTokenAuthority(out, {
    intakeRaw,
    parties: parties.length >= 2 ? parties : undefined,
    partyNames: parties.map((p) => p.partyLegalName),
    surface,
    blockOnUnresolved: opts?.blockOnUnresolved ?? true,
  });
  out = tokenGate.text;
  repairs.push(...tokenGate.repairs);

  const postAuthorityDefuse = repairFusedNoticesHeadingToPriorClause(out);
  if (postAuthorityDefuse.repairs.length > 0) {
    out = postAuthorityDefuse.text;
    repairs.push(...postAuthorityDefuse.repairs);
  }

  return {
    text: out,
    repairs: [...new Set(repairs)],
    ok: tokenGate.ok,
    blocked: tokenGate.blocked,
  };
}

/** Terminal gate before authoritative Pro freeze — repaired body or throw. */
export function assertPaidProNoticeContactAuthorityForFreeze(
  text: string,
  opts?: PaidProNoticeContactAuthorityOpts,
): string {
  const result = applyPaidProNoticeContactAuthority(text, {
    ...opts,
    blockOnUnresolved: true,
  });
  if (!result.ok || result.blocked || containsUnresolvedRenderTokens(result.text)) {
    throw new Error(
      `[paid-pro-notice-contact-authority-blocked] surface=${opts?.surface ?? "freeze"}`,
    );
  }
  return result.text;
}

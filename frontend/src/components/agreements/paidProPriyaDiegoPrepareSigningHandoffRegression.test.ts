/** @vitest-environment jsdom */
/**
 * Priya/Diego post-finalize Prepare for signing: VS01 corpus gate must not fail-closed on
 * a stale frozen snapshot when the enriched post-finalize handoff corpus is signing-ready.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import {
  isPaidProSigningReadyHydratedCorpus,
  NOTICE_SIGNER_SETUP_PLACEHOLDER_RE,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import { buildGuidedVs01SigningHandoff } from "./guidedDealCompletion/guidedVs01SigningHandoff";
import { resolveFinalVs01CorpusOrBlock } from "../../vs01/vs01SigningCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment: $2,400 due on signing. Term: 30 days starting August 24, 2026. Governing law: Texas.";

const DRAFT: ParsedDraftShape = {
  title: "SERVICES AGREEMENT",
  jurisdiction: "Texas",
  parties: [
    { name: "Priya Shah of Northline Studio", role: "client" },
    { name: "Diego Alvarez of Harbor Marks LLC", role: "service_provider" },
  ],
  purpose: "design a logo and brand kit",
};

function buildPriyaDiegoSigningCorpus(noticeEmail: string): string {
  return [
    "SERVICES AGREEMENT",
    "",
    'This Services Agreement (this "Agreement") is entered into as of the Effective Date by and between Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider").',
    "",
    ...Array.from(
      { length: 28 },
      (_, i) =>
        `${i + 1}. Commercial clause ${i + 1}. The Service Provider shall design a logo and brand kit under Texas law.`,
    ),
    "",
    "12. NOTICES",
    "",
    "If to Priya Shah of Northline Studio:",
    "Priya Shah of Northline Studio",
    "Attn: Priya Shah",
    `Email: ${noticeEmail}`,
    "",
    "If to Diego Alvarez of Harbor Marks LLC:",
    "Diego Alvarez of Harbor Marks LLC",
    "Attn: Diego Alvarez",
    `Email: ${noticeEmail}`,
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    "Priya Shah of Northline Studio",
    "By: __________________________",
    "Name: Priya Shah",
    "",
    "SERVICE PROVIDER:",
    "Diego Alvarez of Harbor Marks LLC",
    "By: __________________________",
    "Name: Diego Alvarez",
  ].join("\n");
}

describe("Priya/Diego prepare signing VS01 corpus gate regression", () => {
  beforeEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    try {
      localStorage.setItem("claw_agreement_creator_intake_v1", INTAKE);
    } catch {
      /* ignore */
    }
  });

  afterEach(() => {
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    try {
      localStorage.removeItem("claw_agreement_creator_intake_v1");
    } catch {
      /* ignore */
    }
  });

  it("falls through stale snapshot placeholders to signing-ready post-finalize handoff corpus", () => {
    const staleSnapshotCorpus = buildPriyaDiegoSigningCorpus("provided during signer setup");
    expect(NOTICE_SIGNER_SETUP_PLACEHOLDER_RE.test(staleSnapshotCorpus)).toBe(true);
    expect(isPaidProSigningReadyHydratedCorpus(staleSnapshotCorpus)).toBe(false);

    const authority = buildLivePaidProSignerMetadataAuthority(
      {
        partyCount: 2,
        recipient1Name: "Priya Shah of Northline Studio",
        recipient2Name: "Diego Alvarez of Harbor Marks LLC",
        recipient1Email: "priya.shah@example.com",
        recipient2Email: "diego.alvarez@example.com",
        partySignerNames: ["Priya Shah", "Diego Alvarez"],
        partySignerTitles: ["", ""],
        partyAddresses: ["", ""],
      },
      "live_ui",
      { intakeText: INTAKE, draftPartyNames: DRAFT.parties?.map((p) => p.name ?? "") ?? [] },
    );
    setConsumedPaidProSignerMetadataAuthority(authority);

    createAuthoritativeSigningSnapshot({
      corpus: staleSnapshotCorpus,
      signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
        intakeText: INTAKE,
        draftPartyNames: DRAFT.parties?.map((p) => p.name ?? "") ?? [],
      }),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: authorityPartiesToCanonicalPartyIdentities(authority.parties),
        signFirst: true,
      }),
      intakeText: INTAKE,
      replaceExisting: true,
    });

    const postFinalizePlain = resolvePaidProPostFinalizeReviewPlain(DRAFT);
    expect(isPaidProSigningReadyHydratedCorpus(postFinalizePlain)).toBe(true);
    expect(postFinalizePlain).toContain("priya.shah@example.com");
    expect(postFinalizePlain).toContain("diego.alvarez@example.com");
    expect(postFinalizePlain).not.toMatch(NOTICE_SIGNER_SETUP_PLACEHOLDER_RE);

    const handoff = buildGuidedVs01SigningHandoff({
      corpusText: postFinalizePlain,
      source: "finalized_signer_applied_guided_corpus",
      recipientEmails: ["priya.shah@example.com", "diego.alvarez@example.com"],
    });

    const blockedOnSnapshotOnly = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: staleSnapshotCorpus,
      guidedSigningHandoff: handoff,
      draft: DRAFT as never,
      guidedPro: true,
      premiumComplete: true,
      intakeText: INTAKE,
      signatureRebuilt: true,
    });
    expect(blockedOnSnapshotOnly.allowed, blockedOnSnapshotOnly.blockReason ?? "").toBe(true);
    expect(blockedOnSnapshotOnly.corpus).toBe(postFinalizePlain);
    expect(blockedOnSnapshotOnly.corpus).not.toMatch(NOTICE_SIGNER_SETUP_PLACEHOLDER_RE);
  });
});

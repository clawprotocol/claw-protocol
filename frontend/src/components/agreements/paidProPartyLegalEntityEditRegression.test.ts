/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { buildPaidProSignerMetadataAuthorityForFinalize } from "./paidProSignerMetadataDomCommit";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";
import { shouldDeferPaidProReviewRenderSignerRepair } from "./paidProSignerMetadataCommitPolicy";
import {
  clearSignerSetupAutoCorrectLatch,
  resolveSignerSetupAutoCorrectTarget,
} from "./signerSetupPartyIdentity";
import type { SignerSetupPartyIdentity } from "./signerSetupPartyIdentity";

const CLIENT = "Blue Canyon Analytics LLC";
const CONTAMINATED_PARTY_2 = "Jane Donaldson, Oklahoma law";
const CORRECTED_PARTY_2 = "Jane Donaldson";

function consultingCorpusWithJaneDonaldson(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into by and between ${CLIENT} ("Client") and ${CORRECTED_PARTY_2} ("Service Provider").`,
    "",
    "1. Services and Deliverables",
    "Service Provider shall perform consulting services.",
    "",
    ...Array.from(
      { length: 8 },
      (_, i) => `${i + 2}. Operative clause ${i + 1}.\n${"Professional performance required. ".repeat(8)}`,
    ),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${CLIENT}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "",
    `SERVICE PROVIDER: ${CORRECTED_PARTY_2}`,
    "By: _________________________________",
    "Name: ________________________________",
    "Title: ________________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
  ].join("\n");
}

function mountSignerInput(field: string, value: string): void {
  const root = document.createElement("div");
  root.setAttribute("data-claw-recipient-setup", "1");
  const input = document.createElement("input");
  input.setAttribute("data-claw-recipient-field", field);
  input.value = value;
  Object.defineProperty(input, "getBoundingClientRect", {
    value: () => ({ width: 200, height: 32, top: 0, left: 0, right: 200, bottom: 32 }),
  });
  root.appendChild(input);
  document.body.appendChild(root);
}

function contaminatedPartyIdentities(): SignerSetupPartyIdentity[] {
  return [
    { legalEntityName: CLIENT, displayName: CLIENT, source: "authoritative_manifest" },
    {
      legalEntityName: CONTAMINATED_PARTY_2,
      displayName: "Jane Donaldson",
      source: "canonical_resolver",
    },
  ];
}

describe("paidProPartyLegalEntityEditRegression", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    clearSignerSetupAutoCorrectLatch();
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("dictated jurisdiction contamination: corrected Party 2 legal entity wins through finalize and review", () => {
    const rawCorpus = consultingCorpusWithJaneDonaldson();
    establishPaidProSourceOfTruth({ text: rawCorpus, source: "server_full_draft" });

    expect(
      resolveSignerSetupAutoCorrectTarget({
        slotIndex: 1,
        currentRecipientName: CORRECTED_PARTY_2,
        slotIdentities: contaminatedPartyIdentities(),
      }),
    ).toBeNull();

    mountSignerInput("r1-name", CLIENT);
    mountSignerInput("r2-name", CORRECTED_PARTY_2);
    mountSignerInput("r2-signer-name", "Jane Donaldson");
    mountSignerInput("r2-signer-title", "Owner");
    mountSignerInput("r2-email", "jane@example.com");
    mountSignerInput("r2-party-address", "123 Main St, Tulsa, OK");

    const authority = buildPaidProSignerMetadataAuthorityForFinalize({
      partyCount: 2,
      recipient1Name: CLIENT,
      recipient2Name: CONTAMINATED_PARTY_2,
      recipient1Email: "client@example.com",
      recipient2Email: "",
      extraPartyReviewEmails: [],
      partySignerNames: ["", "Jane Donaldson"],
      partySignerTitles: ["", "Owner"],
      partyAddresses: ["", ""],
    });

    expect(authority.parties[1]?.partyLegalName).toBe(CORRECTED_PARTY_2);
    expect(authority.parties[1]?.partyLegalName).not.toMatch(/Oklahoma/i);

    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus,
      authority,
      intakeRaw: `between ${CLIENT} and ${CORRECTED_PARTY_2}. Oklahoma law.`,
      surface: "finalize_paid_pro_signer_metadata",
      signatureRegionOnly: true,
      repairRecital: true,
    });
    const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
    createAuthoritativeSigningSnapshot({
      corpus: hydrated.corpus,
      signerMetadata,
      partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
        intakeText: `between ${CLIENT} and ${CORRECTED_PARTY_2}`,
      }),
      signatureBlockModel: buildCanonicalSignerManifest({
        identities: hydrated.identities,
        signFirst: true,
      }),
    });

    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(hydrated.corpus).toMatch(new RegExp(`SERVICE PROVIDER:\\s*${CORRECTED_PARTY_2}`, "i"));
    expect(hydrated.corpus).not.toMatch(/Oklahoma law/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Jane Donaldson/i);

    const snapshot = readAuthoritativeSigningCorpus();
    expect(snapshot).toMatch(new RegExp(CORRECTED_PARTY_2, "i"));
    expect(snapshot).not.toMatch(/Oklahoma law/i);

    expect(signerMetadata.recipient2Name).toBe(CORRECTED_PARTY_2);
    expect(signerMetadata.recipient2Name).not.toMatch(/Oklahoma/i);

    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(reviewPlain).not.toMatch(/Oklahoma law/i);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);

    setConsumedPaidProSignerMetadataAuthority(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: CLIENT,
        recipient2Name: CORRECTED_PARTY_2,
        recipient1Email: "client@example.com",
        recipient2Email: "jane@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["", "Jane Donaldson"],
        partySignerTitles: ["", "Owner"],
        partyAddresses: ["", "123 Main St, Tulsa, OK"],
      }),
    );
    expect(shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: false })).toBe(
      false,
    );
    const renderPlain = resolvePaidProReviewRenderPlain();
    expect(renderPlain).not.toMatch(/Oklahoma law/i);
    expect(countPaidProExecutionBlocks(renderPlain)).toBe(1);
  });
});

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

const CLIENT = "Blue Canyon Analytics LLC";
const IRON_VAL = "Iron Val Systems Inc";
const IRON_VALE = "Iron Vale Systems Inc";

function mutualConsultingCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into by and between ${CLIENT} ("Client") and ${IRON_VAL} ("Service Provider").`,
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
    `SERVICE PROVIDER: ${IRON_VAL}`,
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

function simulateMobileFinalizeFromDom(args: {
  rawCorpus: string;
  uiBeforeFinalize: Parameters<typeof buildLivePaidProSignerMetadataAuthority>[0];
}) {
  const authority = buildPaidProSignerMetadataAuthorityForFinalize(args.uiBeforeFinalize);
  setConsumedPaidProSignerMetadataAuthority(authority);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: args.rawCorpus,
    authority,
    intakeRaw: `between ${CLIENT} and ${IRON_VALE}`,
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: true,
  });
  const signerMetadata = authorityPartiesToRecipientMetadata(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata,
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority, {
      intakeText: `between ${CLIENT} and ${IRON_VALE}`,
    }),
    signatureBlockModel: buildCanonicalSignerManifest({
      identities: hydrated.identities,
      signFirst: true,
    }),
  });
  return { authority, hydrated };
}

describe("paidProMobileSignerFinalizeRegression", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    clearPaidProSourceOfTruth();
    clearConsumedPaidProSignerMetadataAuthority();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  it("mobile-style DOM commit hydrates Party 2 signer metadata on final review after Continue", () => {
    const rawCorpus = mutualConsultingCorpus();
    establishPaidProSourceOfTruth({ text: rawCorpus, source: "server_full_draft" });

    mountSignerInput("r1-signer-name", "Sarah Mitchell");
    mountSignerInput("r1-signer-title", "CEO");
    mountSignerInput("r1-email", "legal@bluecanyon.example");
    mountSignerInput("r1-party-address", "234 Rete St., Utes, UT 87432");
    mountSignerInput("r2-signer-name", "Michael Torres");
    mountSignerInput("r2-signer-title", "President");
    mountSignerInput("r2-name", IRON_VALE);
    mountSignerInput("r2-email", "legal@ironvale.example");
    mountSignerInput("r2-party-address", "309 Hue Avenue, El Annuncion, NM 84593");

    const { hydrated } = simulateMobileFinalizeFromDom({
      rawCorpus,
      uiBeforeFinalize: {
        partyCount: 2,
        recipient1Name: CLIENT,
        recipient2Name: IRON_VAL,
        recipient1Email: "client@example.com",
        recipient2Email: "",
        extraPartyReviewEmails: [],
        partySignerNames: ["Sarah Mitchell", ""],
        partySignerTitles: ["CEO", ""],
        partyAddresses: ["", ""],
      },
    });

    expect(countPaidProExecutionBlocks(hydrated.corpus)).toBe(1);
    expect(hydrated.corpus).toMatch(/Name:\s*Sarah Mitchell/i);
    expect(hydrated.corpus).toMatch(/Name:\s*Michael Torres/i);
    expect(hydrated.corpus).toMatch(/Iron Vale Systems Inc/i);
    expect(hydrated.corpus).not.toMatch(/Name:\s*_{4,}/);

    const snapshot = readAuthoritativeSigningCorpus();
    expect(snapshot).toMatch(/Michael Torres/i);

    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(reviewPlain).toMatch(/Michael Torres/i);
    expect(countPaidProExecutionBlocks(reviewPlain)).toBe(1);

    setConsumedPaidProSignerMetadataAuthority(
      buildLivePaidProSignerMetadataAuthority({
        partyCount: 2,
        recipient1Name: CLIENT,
        recipient2Name: IRON_VALE,
        recipient1Email: "client@example.com",
        recipient2Email: "legal@ironvale.example",
        extraPartyReviewEmails: [],
        partySignerNames: ["Sarah Mitchell", "Michael Torres"],
        partySignerTitles: ["CEO", "President"],
        partyAddresses: ["", ""],
      }),
    );
    expect(shouldDeferPaidProReviewRenderSignerRepair({ signerMetadataSessionActive: false })).toBe(
      false,
    );
    const renderPlain = resolvePaidProReviewRenderPlain();
    expect(renderPlain).toMatch(/Michael Torres/i);
    expect(renderPlain).toMatch(/Sarah Mitchell/i);
  });
});

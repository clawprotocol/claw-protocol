/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../../agreement/agreementWorkspaceApi";
import * as agreementPublicVerify from "../../agreement/agreementPublicVerify";
import type { PublicVerifyPayload } from "../../agreement/agreementPublicVerify";
import { SimpleDonePage } from "../../launch/simpleProduct/SimpleDonePage";
import { markSimpleFlowSent } from "../../launch/simpleFlowSent";
import { writeSimpleDoneReviewRecipientLinks } from "../../launch/simpleProduct/simpleDoneReviewRecipientLinks";
import * as simpleDoneReviewRecipientLinks from "../../launch/simpleProduct/simpleDoneReviewRecipientLinks";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
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
import { setPaidProPinnedSignerAppliedCorpus, clearPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import * as paidProReviewLinkCorpusParity from "./paidProReviewLinkCorpusParity";

const { mockNavigate } = vi.hoisted(() => ({
  mockNavigate: vi.fn(),
}));

vi.mock("../../launch/simpleProduct/agreementToVs01SigningBridge", () => ({
  tryNavigatePaidProAgreementSenderFirstVs01Esign: vi.fn(async () => true),
}));

vi.mock("../../launch/LaunchNavContext", () => ({
  useLaunchNav: () => ({
    pathname: "/app/done",
    search: "",
    hash: "",
    navigate: mockNavigate,
  }),
}));

vi.mock("../../monetization/usePowerGatedNavigation", () => ({
  usePowerGatedNavigation: () => ({
    navigateToReuse: vi.fn(),
    navigateToWorkProduct: vi.fn(),
  }),
}));

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const agreementId = "ag_test305_party_sim";

const PARTY_TWO_HREF = `https://lawdog.test/agreements/${agreementId}/review?token=party-two-token`;
const PARTY_ONE_HREF = `https://lawdog.test/agreements/${agreementId}/review?token=party-one-token`;

function buildCorpus() {
  const freezeBody = [
    "CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    "Section 4. Payment. Client shall pay within fifteen (15) days of invoice.",
    "",
    ...Array.from({ length: 16 }, (_, i) => `Section ${i + 5}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `PARTY: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: BCA45@me.com",
    "Address for Notice: 23 Edge St.",
    "Date: _____________________________",
    "",
    `PARTY: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: Huntme45@me.com",
    "Address for Notice: 345 Fist Ave.",
    "Date: _____________________________",
  ].join("\n");
  const authority = buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "BCA45@me.com",
    recipient2Email: "Huntme45@me.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: ["23 Edge St.", "345 Fist Ave."],
  });
  setConsumedPaidProSignerMetadataAuthority(authority);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: freezeBody,
    authority,
    intakeRaw: "",
    surface: "test305",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
  return hydrated.corpus;
}

function baseDraft(corpus: string): AgreementDraft {
  return {
    id: agreementId,
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: BLUE, role: "owner" },
      { id: "p2", name: IRON, role: "party" },
    ],
    purpose: corpus,
    payment_terms: "premium",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00Z" }],
    audit_log: [],
    premium_render_source: "review_first_final_corpus",
    server_full_document_text: corpus,
    pro_redline_v1: { review_first_final_corpus: { text: corpus } },
  } as AgreementDraft;
}

const verifyPayload: PublicVerifyPayload = {
  agreement_id: agreementId,
  summary: { title: "Consulting Agreement" },
  participants: [],
  version_history: [],
  signature_status: { fully_executed: false },
  signature_events: [],
  verification: { agreement_hash: "abc" },
};

describe("Test305 Party 1 reviewer simulation on review link ready page", () => {
  const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
  const simulationLogSpy = vi.spyOn(paidProReviewLinkCorpusParity, "logReviewLinkPartySimulationOpened");

  beforeEach(() => {
    mockNavigate.mockClear();
    openSpy.mockClear();
    simulationLogSpy.mockClear();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    const corpus = buildCorpus();
    const corpusHash = hashPaidProCorpus(corpus);
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue(verifyPayload);
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraftWithSigningLock").mockResolvedValue({
      ok: true,
      draft: baseDraft(corpus),
      lockedVersionId: null,
    });
    vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft: baseDraft(corpus),
    });
    vi.spyOn(simpleDoneReviewRecipientLinks, "mintReviewPartySimulationRecipientLink").mockResolvedValue({
      reviewHref: PARTY_ONE_HREF,
      partyName: BLUE,
      partyIndex: 0,
    });
    markSimpleFlowSent(agreementId);
    writeSimpleDoneReviewRecipientLinks({
      agreementId,
      recipients: [
        {
          displayName: IRON,
          reviewHref: PARTY_TWO_HREF,
          party_index: 1,
          party_name: IRON,
          reviewer_name: IRON,
          token_status: "active",
          created_at: "2026-01-01T00:00:00Z",
        },
      ],
      agreementPartyDisplayNames: [BLUE, IRON],
    });
    expect(corpusHash.length).toBeGreaterThan(0);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders Party 1 and Party 2 reviewer buttons; both open with same corpus hash", async () => {
    const user = userEvent.setup();
    render(<SimpleDonePage agreementId={agreementId} />);

    await waitFor(() => {
      expect(screen.getByTestId("simple-done-open-reviewer-view-global")).toBeTruthy();
      expect(screen.getByTestId("simple-done-open-party-one-reviewer-view")).toBeTruthy();
    });

    await user.click(screen.getByTestId("simple-done-open-reviewer-view-global"));
    expect(openSpy).toHaveBeenCalledWith(PARTY_TWO_HREF, "_blank", "noopener,noreferrer");
    expect(simulationLogSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        partyIndex: 1,
        partyName: IRON,
        hydrated: true,
        blankSignerLinesRemaining: 0,
      }),
    );
    const partyTwoHash = simulationLogSpy.mock.calls[0]![0]!.corpusHash as string;

    await user.click(screen.getByTestId("simple-done-open-party-one-reviewer-view"));
    await waitFor(() => expect(simulationLogSpy).toHaveBeenCalledTimes(2));
    expect(openSpy).toHaveBeenLastCalledWith(PARTY_ONE_HREF, "_blank", "noopener,noreferrer");
    expect(simulationLogSpy).toHaveBeenLastCalledWith(
      expect.objectContaining({
        partyIndex: 0,
        partyName: BLUE,
        corpusHash: partyTwoHash,
        hydrated: true,
        blankSignerLinesRemaining: 0,
      }),
    );
    expect(partyTwoHash.length).toBeGreaterThan(0);
  });
});

/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { AgreementRecipientReview } from "./AgreementRecipientReview";
import { AccessProvider } from "../access/AccessContext";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  replaceAuthoritativeSigningSnapshotCorpus,
} from "../components/agreements/authoritativeSigningSnapshot";
import { buildCanonicalSignerManifest } from "../components/agreements/guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
} from "../components/agreements/paidProSignerMetadataAuthority";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "../components/agreements/paidProFinalHydratedCorpus";
import {
  resetPremiumRecipientHandoffDedupForTests,
  writePremiumRecipientHandoffLinear,
} from "../components/agreements/premiumPartyNamesHandoff";
import { formatAgreementPlainTextForEditing } from "./formatAgreementPlainTextForEditing";
import { resolveReviewFirstDisplayCorpus } from "../launch/simpleProduct/reviewFirstDisplayCorpus";
import { countPaidProExecutionBlocks } from "../components/agreements/paidProExecutionBlockAuthority";
import { resetPaidProTest315ReviewCopyHydrationLogsForTests } from "../launch/simpleProduct/reviewReadyHydratedDisplayCorpus";

const agreementId = "ag_test320_reviewer_visible_metadata";
const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";
const BLUE_ADDRESS = "13 Firestane Ave., Billings, MT 65323";
const IRON_ADDRESS = "934 Tree Trunk Blvd., Humboltstrand, CA 94032";
const BLUE_EMAIL = "bca34@gmail.com";
const IRON_EMAIL = "ivs873@gmail.com";

function jsonResponse(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function buildFullyHydratedBody() {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    `Email for Notice: ${BLUE_EMAIL}`,
    `Address for Notice: ${BLUE_ADDRESS}`,
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    `Email for Notice: ${IRON_EMAIL}`,
    `Address for Notice: ${IRON_ADDRESS}`,
    "Date: _____________________________",
  ].join("\n");
}

function buildReviewerRoutePartialBody() {
  return [
    "SERVICES AGREEMENT",
    "",
    `This Services Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
    "",
    ...Array.from({ length: 10 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    `Email for Notice: ${BLUE_EMAIL}`,
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    `Email for Notice: ${IRON_EMAIL}`,
    "Date: _____________________________",
  ].join("\n");
}

function reviewerDraftFromApi() {
  const partial = buildReviewerRoutePartialBody();
  return {
    id: agreementId,
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: BLUE, role: "owner" },
      { id: "p2", name: IRON, role: "party" },
    ],
    purpose: partial,
    payment_terms: "premium",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    versions: [],
    audit_log: [],
    premium_render_source: "review_first_final_corpus",
    server_full_document_text: partial,
    premium_server_full_document_text: buildFullyHydratedBody(),
    pro_redline_v1: {
      review_first_final_corpus: { text: partial },
    },
  };
}

function armPartialSnapshotWithFullDraftHint() {
  const authority = buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: BLUE_EMAIL,
    recipient2Email: IRON_EMAIL,
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [BLUE_ADDRESS, IRON_ADDRESS],
  });
  const fullHydrated = buildFullyHydratedBody();
  const partial = buildReviewerRoutePartialBody();
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);

  createAuthoritativeSigningSnapshot({
    corpus: fullHydrated,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  replaceAuthoritativeSigningSnapshotCorpus({
    corpus: partial,
    surface: "test320_reviewer_partial_snapshot",
  });
  setPaidProPinnedSignerAppliedCorpus(fullHydrated);
}

function armHandoffWithoutAddresses() {
  writePremiumRecipientHandoffLinear([
    {
      name: BLUE,
      email: BLUE_EMAIL,
      role: "owner",
      signerName: "Sarah Mitchell",
      signerTitle: "CEO",
    },
    {
      name: IRON,
      email: IRON_EMAIL,
      role: "party",
      signerName: "Michael Torres",
      signerTitle: "President",
    },
  ]);
}

describe("Test320 AgreementRecipientReview visible execution metadata", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    resetPremiumRecipientHandoffDedupForTests();
    resetPaidProTest315ReviewCopyHydrationLogsForTests();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    sessionStorage.clear();
    localStorage.clear();
  });

  it("reviewer route renders both Address for Notice values in the visible document", async () => {
    Object.defineProperty(Element.prototype, "scrollIntoView", {
      configurable: true,
      value: vi.fn(),
    });
    armPartialSnapshotWithFullDraftHint();
    armHandoffWithoutAddresses();

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : typeof Request !== "undefined" && input instanceof Request
              ? input.url
              : String(input);
      const method = (
        init?.method ||
        (typeof Request !== "undefined" && input instanceof Request ? input.method : "GET")
      ).toUpperCase();
      if (method === "POST" && url.includes("/render")) {
        return jsonResponse({ rendered_html: "<p>Services Agreement</p><p>Body.</p>" });
      }
      if (method === "GET" && url.includes("/api/agreements/") && !url.includes("/revise")) {
        return jsonResponse({ draft: reviewerDraftFromApi() });
      }
      return new Response("not found", { status: 404 });
    });

    render(
      <AccessProvider>
        <AgreementRecipientReview agreementId={agreementId} recipientAccessToken="tok_test320" />
      </AccessProvider>,
    );

    await waitFor(() => {
      expect(screen.queryByText(/Loading agreement/i)).toBeNull();
    });

    await waitFor(() => {
      expect(screen.getByText(/Sarah Mitchell/i)).toBeTruthy();
      expect(screen.getByText(/Michael Torres/i)).toBeTruthy();
      expect(screen.getByText(/Firestane/i)).toBeTruthy();
      expect(screen.getByText(/Tree Trunk/i)).toBeTruthy();
    });

    const docShell = screen.getByTestId("recipient-document-shell");
    expect(docShell.textContent).toMatch(/Address for Notice/i);
    expect(docShell.textContent).not.toMatch(/Address for Notice:\s*_{4,}/i);

    const draft = reviewerDraftFromApi();
    const copyText = formatAgreementPlainTextForEditing(
      resolveReviewFirstDisplayCorpus(draft, "copy_export")?.text ?? "",
    );
    expect(copyText).toContain(BLUE_ADDRESS);
    expect(copyText).toContain(IRON_ADDRESS);
    expect(countPaidProExecutionBlocks(copyText)).toBe(1);
  });
});

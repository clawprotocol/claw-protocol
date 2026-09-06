/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementPublicVerify from "../../agreement/agreementPublicVerify";
import * as ownerSignedAgreementView from "../ownerSignedAgreementView";
import { OwnerSignedAgreementPage } from "./OwnerSignedAgreementPage";
import { LaunchNavProvider } from "../LaunchNavContext";

const AG = "ag_empty_corpus_view_signed";
const VIEW_SIGNED_PATH = `/app/agreements/${AG}/view-signed`;

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    enabled: false,
    loading: false,
    session: null,
    user: { id: "owner_1" },
    signInEmail: vi.fn(),
    signOut: vi.fn(),
  })),
}));

function renderViewSignedPage() {
  window.history.replaceState(null, "", VIEW_SIGNED_PATH);
  return render(
    <LaunchNavProvider>
      <OwnerSignedAgreementPage agreementId={AG} />
    </LaunchNavProvider>,
  );
}

describe("OwnerSignedAgreementPage — fully_executed empty-corpus path", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
      agreement_id: AG,
      signature_status: { fully_executed: true, signer_party_count: 2, signatures_recorded: 2 },
      verification: { agreement_hash: "14d67e4f36db2bb2e0cfa08beda67b10707684ddfd85010b07a6113677c289fe" },
    } as never);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("does not show dual empty-body errors or a dead Download PDF when corpus is missing", async () => {
    vi.spyOn(ownerSignedAgreementView, "loadOwnerSignedAgreementPreview").mockResolvedValue(null);
    renderViewSignedPage();

    await waitFor(() => {
      expect(screen.getByTestId("owner-signed-agreement-load-error").textContent).toContain(
        "Could not load this signed agreement.",
      );
    });
    expect(screen.queryByText("No signed agreement text is available yet.")).toBeNull();
    expect(screen.queryByTestId("owner-signed-agreement-download-pdf")).toBeNull();
    expect(screen.getByTestId("owner-signed-agreement-signatures").textContent).toContain("Fully signed");
  });

  it("paints accepted-review fallback and hides PDF until a signed snapshot exists", async () => {
    const reviewPlain = `${"Certified Review commercial agreement. ".repeat(40)}Section 1. Services.`;
    vi.spyOn(ownerSignedAgreementView, "loadOwnerSignedAgreementPreview").mockResolvedValue({
      draft: { id: AG, title: "Northline Services Agreement" } as AgreementDraft,
      html: `<div>${reviewPlain}</div>`,
      corpusText: reviewPlain,
      usesPremiumDocument: false,
      corpusSource: "accepted_review",
      pdfAvailable: false,
    });
    renderViewSignedPage();

    await waitFor(() => {
      expect(screen.getByTestId("owner-signed-agreement-draft-loaded")).toBeTruthy();
    });
    expect(screen.queryByTestId("owner-signed-agreement-load-error")).toBeNull();
    expect(screen.queryByText("Could not load this signed agreement.")).toBeNull();
    expect(screen.queryByText("No signed agreement text is available yet.")).toBeNull();
    expect(screen.getByTestId("owner-signed-agreement-fallback-html").textContent).toContain(
      "Certified Review commercial agreement",
    );
    expect(screen.queryByTestId("owner-signed-agreement-download-pdf")).toBeNull();
    expect(screen.getByTestId("owner-signed-agreement-page").getAttribute("data-corpus-source")).toBe(
      "accepted_review",
    );
  });
});

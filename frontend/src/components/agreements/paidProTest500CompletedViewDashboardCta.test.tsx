/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import * as agreementPublicVerify from "../../agreement/agreementPublicVerify";
import * as ownerSignedAgreementView from "../../launch/ownerSignedAgreementView";
import {
  clearAuthenticatedWorkspaceSession,
  markAuthenticatedWorkspaceSession,
} from "../../launch/completedAgreementViewContext";
import { OwnerSignedAgreementPage } from "../../launch/simpleProduct/OwnerSignedAgreementPage";
import { LaunchNavProvider } from "../../launch/LaunchNavContext";
import { TEST498_SIGNERS } from "./paidProTest498Fixtures";
import {
  parseCompletedExecutionBlocksFromCorpus,
  validateCompletedExecutionMetadataInvariant,
} from "../../vs01/paidProCompletedExecutionMetadataAuthority";

const AG = "ag_test500";
const VIEW_SIGNED_PATH = `/app/agreements/${AG}/view-signed`;

vi.mock("../../auth/AuthProvider", () => ({
  useAuth: vi.fn(() => ({
    enabled: false,
    loading: false,
    session: null,
    user: null,
    signInEmail: vi.fn(),
    signOut: vi.fn(),
  })),
}));

function witnessCorpus(): string {
  const blocks = TEST498_SIGNERS.map(
    (party) =>
      `${party.partyLegalName}:\nBy: ${party.signerName}\nName: ${party.signerName}\nTitle: ${party.signerTitle}\nDate: June 30, 2026`,
  ).join("\n\n");
  return `${"Services agreement corpus. ".repeat(120)}\nIN WITNESS WHEREOF, the Parties execute this Agreement.\n\n${blocks}`;
}

function mockLoadedPreview() {
  const corpusPlain = witnessCorpus();
  const draft = {
    id: AG,
    title: "Three Party Agreement",
    parties: TEST498_SIGNERS.map((p) => ({ name: p.partyLegalName })),
  } as AgreementDraft;

  vi.spyOn(ownerSignedAgreementView, "loadOwnerSignedAgreementPreview").mockResolvedValue({
    draft,
    html: `<div>${corpusPlain}</div>`,
    corpusText: corpusPlain,
    usesPremiumDocument: false,
    corpusSource: "fully_executed_snapshot",
  });
  vi.spyOn(agreementPublicVerify, "fetchPublicAgreementVerify").mockResolvedValue({
    agreement_id: AG,
    signature_status: { fully_executed: true, signer_party_count: 3, signatures_recorded: 3 },
  } as never);
}

function renderViewSignedPage(pathname = VIEW_SIGNED_PATH) {
  window.history.replaceState(null, "", pathname);
  return render(
    <LaunchNavProvider>
      <OwnerSignedAgreementPage agreementId={AG} />
    </LaunchNavProvider>,
  );
}

describe("TEST500 — completed view dashboard CTA visibility", () => {
  beforeEach(() => {
    clearAuthenticatedWorkspaceSession();
    mockLoadedPreview();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    clearAuthenticatedWorkspaceSession();
  });

  it("owner workspace view-signed shows Back to dashboard", async () => {
    markAuthenticatedWorkspaceSession();
    renderViewSignedPage();

    await waitFor(() => {
      expect(screen.getByTestId("owner-signed-agreement-draft-loaded")).toBeTruthy();
    });
    expect(screen.getByTestId("owner-signed-agreement-back")).toBeTruthy();
    expect(screen.getByTestId("owner-signed-agreement-page").getAttribute("data-completed-view-surface")).toBe(
      "owner_workspace_view_signed",
    );
    expect(screen.getByTestId("owner-signed-agreement-download-pdf")).toBeTruthy();
  });

  it("public recipient completed email-link view hides Back to dashboard", async () => {
    renderViewSignedPage();

    await waitFor(() => {
      expect(screen.getByTestId("owner-signed-agreement-draft-loaded")).toBeTruthy();
    });
    expect(screen.queryByTestId("owner-signed-agreement-back")).toBeNull();
    expect(screen.getByTestId("owner-signed-agreement-page").getAttribute("data-completed-view-surface")).toBe(
      "public_recipient_completed_link",
    );
    expect(screen.getByTestId("owner-signed-agreement-download-pdf")).toBeTruthy();
    expect(screen.getByTestId("app-shell-primary-nav").getAttribute("data-app-shell-nav")).toBe(
      "public_completed",
    );
  });

  it("completed execution metadata remains correct on public recipient view", async () => {
    renderViewSignedPage();
    await waitFor(() => {
      expect(screen.getByTestId("owner-signed-agreement-draft-loaded")).toBeTruthy();
    });

    const loaded = await ownerSignedAgreementView.loadOwnerSignedAgreementPreview(AG);
    expect(loaded?.corpusText).toBeTruthy();
    const rows = parseCompletedExecutionBlocksFromCorpus(
      loaded!.corpusText,
      TEST498_SIGNERS.map((p) => p.partyLegalName),
    );
    expect(rows[0]?.byValue).toBe("Sandra Wells");
    expect(rows[1]?.byValue).toBe("Caleb Price");
    expect(rows[2]?.byValue).toBe("Maya Coleman");
    const validation = validateCompletedExecutionMetadataInvariant({ corpusPlain: loaded!.corpusText });
    expect(validation.ok).toBe(true);
  });

  it("signer completion public surface resolves without dashboard CTA", async () => {
    const { resolveCompletedAgreementViewContext, shouldShowBackToDashboard } = await import(
      "../../launch/completedAgreementViewContext"
    );
    const ctx = resolveCompletedAgreementViewContext({
      pathname: "/app/esign/doc_test500",
      search: "?vs01_recipient_sign=1",
      recipientSigningDone: true,
    });
    expect(ctx.surface).toBe("signer_completion_public");
    expect(shouldShowBackToDashboard(ctx)).toBe(false);
  });
});

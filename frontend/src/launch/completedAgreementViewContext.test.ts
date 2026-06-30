/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  clearAuthenticatedWorkspaceSession,
  extractAgreementIdFromViewSignedPath,
  isAuthenticatedWorkspaceView,
  isOwnerSignedAgreementViewPath,
  isRecipientSigningPublicSurface,
  markAuthenticatedWorkspaceSession,
  readAuthenticatedWorkspaceSession,
  resolveCompletedAgreementViewContext,
  shouldMarkWorkspaceSessionForPath,
  shouldShowBackToDashboard,
} from "./completedAgreementViewContext";

describe("completedAgreementViewContext", () => {
  beforeEach(() => {
    clearAuthenticatedWorkspaceSession();
  });

  it("marks workspace session only for in-app routes, not cold view-signed links", () => {
    expect(shouldMarkWorkspaceSessionForPath("/app")).toBe(true);
    expect(shouldMarkWorkspaceSessionForPath("/app/agreements")).toBe(true);
    expect(shouldMarkWorkspaceSessionForPath("/app/agreements/ag_1/view-signed")).toBe(false);
    expect(shouldMarkWorkspaceSessionForPath("/app/esign/doc_1")).toBe(false);
  });

  it("detects owner signed agreement view path", () => {
    expect(isOwnerSignedAgreementViewPath("/app/agreements/ag_test500/view-signed")).toBe(true);
    expect(extractAgreementIdFromViewSignedPath("/app/agreements/other/view")).toBe("");
  });

  it("detects recipient signing public surface", () => {
    expect(isRecipientSigningPublicSurface("/app/esign/doc_1", "?vs01_recipient_sign=1")).toBe(true);
    expect(isRecipientSigningPublicSurface("/app/esign/doc_1", "")).toBe(false);
  });

  it("shouldShowBackToDashboard is true only for authenticated owner workspace view-signed", () => {
    markAuthenticatedWorkspaceSession();
    const ownerCtx = resolveCompletedAgreementViewContext({
      pathname: "/app/agreements/ag_test500/view-signed",
      agreementId: "ag_test500",
      hasAuthSession: false,
      hasWorkspaceSession: true,
    });
    expect(ownerCtx.surface).toBe("owner_workspace_view_signed");
    expect(shouldShowBackToDashboard(ownerCtx)).toBe(true);

    const publicCtx = resolveCompletedAgreementViewContext({
      pathname: "/app/agreements/ag_test500/view-signed",
      agreementId: "ag_test500",
      hasAuthSession: false,
      hasWorkspaceSession: false,
    });
    expect(publicCtx.surface).toBe("public_recipient_completed_link");
    expect(shouldShowBackToDashboard(publicCtx)).toBe(false);
  });

  it("signer completion public surface never shows dashboard CTA", () => {
    const ctx = resolveCompletedAgreementViewContext({
      pathname: "/app/esign/doc_test500",
      search: "?vs01_recipient_sign=1",
      hasAuthSession: false,
      hasWorkspaceSession: false,
      recipientSigningDone: true,
    });
    expect(ctx.surface).toBe("signer_completion_public");
    expect(shouldShowBackToDashboard(ctx)).toBe(false);
  });

  it("isAuthenticatedWorkspaceView prefers auth session or workspace marker", () => {
    expect(
      isAuthenticatedWorkspaceView({ hasAuthSession: true, hasWorkspaceSession: false }),
    ).toBe(true);
    expect(
      isAuthenticatedWorkspaceView({ hasAuthSession: false, hasWorkspaceSession: true }),
    ).toBe(true);
    expect(
      isAuthenticatedWorkspaceView({ hasAuthSession: false, hasWorkspaceSession: false }),
    ).toBe(false);
  });

  it("persists workspace session marker in sessionStorage", () => {
    expect(readAuthenticatedWorkspaceSession()).toBe(false);
    markAuthenticatedWorkspaceSession();
    expect(readAuthenticatedWorkspaceSession()).toBe(true);
    clearAuthenticatedWorkspaceSession();
    expect(readAuthenticatedWorkspaceSession()).toBe(false);
  });
});

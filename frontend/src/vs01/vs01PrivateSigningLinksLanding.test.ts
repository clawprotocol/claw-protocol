import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FIRST_FAILING_PREPARE_LANDING_PREDICATE,
  PACKET_READY_MUST_NOT_WIN_REASON,
  RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
  isPaidProPacketReadyDashboardPath,
  privateSigningLinksRoute,
  resolvePostPrepareBuyerSurface,
  shouldNavigateToPacketReadyDashboardAfterPrepare,
} from "./vs01PrivateSigningLinksLanding";
import { paidProPacketReadyDashboardPath } from "./vs01PaidProPacketReadyNavigation";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const DOC_ID = "doc_vs01_seed_ok";

describe("remount Prepare → seed ok → stay on private signing-links", () => {
  it("names the first failing predicate: packet-ready dashboard after seed", () => {
    expect(FIRST_FAILING_PREPARE_LANDING_PREDICATE).toBe(
      "completeBridgePreparePacket_navigates_vs01_packet_ready_dashboard",
    );
    expect(isPaidProPacketReadyDashboardPath(paidProPacketReadyDashboardPath())).toBe(true);
    expect(isPaidProPacketReadyDashboardPath("/app?vs01_packet_ready=1")).toBe(true);
    expect(shouldNavigateToPacketReadyDashboardAfterPrepare()).toBe(false);
  });

  it("remount Prepare + vs01-signing-seed 200 stays on /app/esign, not /app?vs01_packet_ready=1", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: `/app/esign/${DOC_ID}?agreement_bridge=1`,
    });
    expect(landing.stayOnPrivateLinks).toBe(true);
    expect(landing.navigateTo).toBeNull();
    expect(landing.step).toBe(3);
    expect(landing.reason).toBe("stay_on_private_signing_links");
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? "")).toBe(false);
    expect(privateSigningLinksRoute(DOC_ID)).toBe(`/app/esign/${DOC_ID}`);

    const recoverFromDashboard = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: "/app?vs01_packet_ready=1",
      packetReadyQuery: true,
    });
    expect(recoverFromDashboard.stayOnPrivateLinks).toBe(true);
    expect(recoverFromDashboard.navigateTo).toBe(`/app/esign/${DOC_ID}`);
    expect(isPaidProPacketReadyDashboardPath(recoverFromDashboard.navigateTo ?? "")).toBe(false);
  });

  it("vs01_packet_ready must not win over the create/review links surface", () => {
    const createReview = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: `/app/agreements/${AGREEMENT_ID}`,
      packetReadyQuery: true,
      createReviewLinksSurfaceActive: true,
    });
    expect(createReview.stayOnPrivateLinks).toBe(true);
    expect(createReview.navigateTo).toBeNull();
    expect(createReview.reason).toBe(PACKET_READY_MUST_NOT_WIN_REASON);
    expect(isPaidProPacketReadyDashboardPath("/app?vs01_packet_ready=1")).toBe(true);

    const esignWithQuery = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: `/app/esign/${DOC_ID}`,
      packetReadyQuery: true,
    });
    expect(esignWithQuery.stayOnPrivateLinks).toBe(true);
    expect(esignWithQuery.navigateTo).toBeNull();
    expect(esignWithQuery.reason).toBe(PACKET_READY_MUST_NOT_WIN_REASON);
  });

  it("recipient-access-token 409 does not navigate to the dashboard", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: `/app/esign/${DOC_ID}?agreement_bridge=1`,
      recipientAccessTokenStatus: 409,
      packetReadyQuery: true,
    });
    expect(landing.stayOnPrivateLinks).toBe(true);
    expect(landing.navigateTo).toBeNull();
    expect(landing.reason).toBe(RECIPIENT_ACCESS_TOKEN_409_STAY_REASON);
    expect(landing.step).toBe(3);
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? "/app/esign/x")).toBe(false);

    const fromErrantDashboard = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: DOC_ID,
      currentPath: "/app?vs01_packet_ready=1",
      packetReadyQuery: true,
      recipientAccessTokenStatus: 409,
    });
    expect(fromErrantDashboard.stayOnPrivateLinks).toBe(true);
    expect(fromErrantDashboard.navigateTo).toBe(`/app/esign/${DOC_ID}`);
    expect(isPaidProPacketReadyDashboardPath(fromErrantDashboard.navigateTo ?? "")).toBe(false);
  });

  it("wizard completeBridgePreparePacket stays on private links and does not remint or email", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    const start = wizard.indexOf("const completeBridgePreparePacket = useCallback");
    expect(start).toBeGreaterThanOrEqual(0);
    const end = wizard.indexOf("}, [", start);
    const block = wizard.slice(start, end);
    expect(block).toContain("resolvePostPrepareBuyerSurface");
    expect(block).toContain("goToStep(3)");
    expect(block).toContain("[vs01-private-signing-links-stay]");
    expect(block).not.toContain("paidProPacketReadyDashboardPath");
    expect(block).not.toContain("dispatchSigningInvitesFromHandoff");
    expect(block).not.toContain("recipient-access-token");
    expect(block).not.toMatch(/resend|sendEmail|send_mail|postSigningLinksSent/i);
    expect(wizard).toContain("FIRST_FAILING_PREPARE_LANDING_PREDICATE");

    const intake = readFileSync(
      join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const track = intake.slice(
      intake.indexOf("const enterGuidedSignatureTrackRoute"),
      intake.indexOf("const enterGuidedSignatureTrackRoute") + 4200,
    );
    expect(track).toContain("executePaidProPostRecipientSetupHandoff");
    expect(track).not.toContain("vs01_packet_ready");
    expect(track).not.toContain("paidProPacketReadyDashboardPath");
  });
});

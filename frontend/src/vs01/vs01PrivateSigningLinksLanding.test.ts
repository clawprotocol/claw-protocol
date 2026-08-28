/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  FIRST_FAILING_PACKET_READY_REMOUNT_PREDICATE,
  FIRST_FAILING_PREPARE_LANDING_PREDICATE,
  PACKET_READY_MUST_NOT_WIN_REASON,
  PACKET_READY_REMOUNT_REWRITE_REASON,
  PACKET_READY_REMOUNT_STAY_CREATE_REASON,
  PAID_PRO_CREATE_REVIEW_PATH,
  RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
  bindPacketReadyRemountResume,
  isPaidProCreateReviewPath,
  isPaidProPacketReadyDashboardPath,
  packetReadyQueryFromSearch,
  privateSigningLinksRoute,
  resolveActivePacketReadyRemountContext,
  resolvePacketReadyRemountLanding,
  resolvePostPrepareBuyerSurface,
  shouldHonorPacketReadyAsDashboardLanding,
  shouldNavigateToPacketReadyDashboardAfterPrepare,
} from "./vs01PrivateSigningLinksLanding";
import { paidProPacketReadyDashboardPath } from "./vs01PaidProPacketReadyNavigation";
import {
  PAID_PRO_VS01_POST_SIGN_SESSION_KEY,
  writePaidProVs01PostSignHandoff,
} from "./vs01PaidProPostSignHandoff";
import { readCreateReviewAgreementResumeId } from "../components/agreements/agreementIntakeStorage";

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
    const trackStart = intake.indexOf("const enterGuidedSignatureTrackRoute");
    const handoffAt = intake.indexOf("executePaidProPostRecipientSetupHandoff", trackStart);
    expect(handoffAt).toBeGreaterThan(trackStart);
    const trackEnd = intake.indexOf("\n  }, [", handoffAt);
    const track = intake.slice(trackStart, trackEnd > handoffAt ? trackEnd : handoffAt + 80);
    expect(track).toContain("executePaidProPostRecipientSetupHandoff");
    expect(track).not.toContain("vs01_packet_ready");
    expect(track).not.toContain("paidProPacketReadyDashboardPath");
  });
});

describe("packet-ready remount / hard refresh stays off the owner dashboard", () => {
  afterEach(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("names the first failing remount predicate: boot honors vs01_packet_ready as the list", () => {
    expect(FIRST_FAILING_PACKET_READY_REMOUNT_PREDICATE).toBe(
      "vs01_packet_ready_boot_lands_owner_dashboard",
    );
    expect(shouldHonorPacketReadyAsDashboardLanding()).toBe(false);
    expect(packetReadyQueryFromSearch("?vs01_packet_ready=1")).toBe(true);
    expect(isPaidProPacketReadyDashboardPath("/app?vs01_packet_ready=1")).toBe(true);
    expect(isPaidProCreateReviewPath(`/app/create?checkout_session_id=cs_live`)).toBe(true);
  });

  it("remount/refresh with packet-prepared + vs01_packet_ready=1 rewrites to Review, not the list", () => {
    const landing = resolvePacketReadyRemountLanding({
      currentPath: "/app?vs01_packet_ready=1",
      documentId: DOC_ID,
      packetPrepared: true,
    });
    expect(landing.stayOffDashboard).toBe(true);
    expect(landing.navigateTo).toBe(PAID_PRO_CREATE_REVIEW_PATH);
    expect(landing.reason).toBe(PACKET_READY_REMOUNT_REWRITE_REASON);
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? "")).toBe(false);
    expect(landing.navigateTo).not.toBe("/app");
  });

  it("paid-return create URL does not navigate to the dashboard when packet-prepared", () => {
    const landing = resolvePacketReadyRemountLanding({
      currentPath: `/app/create?checkout_session_id=cs_dd37f0e4`,
      documentId: DOC_ID,
      packetPrepared: true,
    });
    expect(landing.stayOffDashboard).toBe(true);
    expect(landing.navigateTo).toBeNull();
    expect(landing.reason).toBe(PACKET_READY_REMOUNT_STAY_CREATE_REASON);
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? "/app/create")).toBe(false);
  });

  it("esign remount stays on private-links step 3 and 409 does not eject to dashboard", () => {
    const stay = resolvePacketReadyRemountLanding({
      currentPath: `/app/esign/${DOC_ID}?agreement_bridge=1`,
      documentId: DOC_ID,
      packetPrepared: true,
    });
    expect(stay.navigateTo).toBeNull();
    expect(stay.reason).toBe("stay_on_private_signing_links");

    const eject = resolvePacketReadyRemountLanding({
      currentPath: "/app?vs01_packet_ready=1",
      documentId: DOC_ID,
      packetPrepared: true,
      recipientAccessTokenStatus: 409,
    });
    expect(eject.stayOffDashboard).toBe(true);
    expect(isPaidProPacketReadyDashboardPath(eject.navigateTo ?? "")).toBe(false);
    expect(eject.reason).toBe(RECIPIENT_ACCESS_TOKEN_409_STAY_REASON);

    const create409 = resolvePacketReadyRemountLanding({
      currentPath: "/app/create?checkout_session_id=cs_live",
      packetPrepared: true,
      recipientAccessTokenStatus: 409,
    });
    expect(create409.navigateTo).toBeNull();
    expect(isPaidProPacketReadyDashboardPath(create409.navigateTo ?? "/app/create")).toBe(false);
  });

  it("binds the active persist so Review remount hydrates this deal, not a blank create", () => {
    writePaidProVs01PostSignHandoff({
      v: 1,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Paid persist",
      vs01DocumentId: DOC_ID,
      receiptId: "",
      receiptHashSha256: null,
      packetPrepareOnly: true,
      savedAt: "2026-08-28T21:16:00.000Z",
      signers: [
        {
          counterpartyId: "cp1",
          displayName: "Buyer",
          email: "buyer@example.test",
          signingUrl: "https://lawdog.local/app/esign/doc?s=1",
        },
      ],
    });
    expect(sessionStorage.getItem(PAID_PRO_VS01_POST_SIGN_SESSION_KEY)).toBeTruthy();
    const ctx = resolveActivePacketReadyRemountContext();
    expect(ctx?.agreementId).toBe(AGREEMENT_ID);
    expect(ctx?.documentId).toBe(DOC_ID);
    bindPacketReadyRemountResume(ctx!.agreementId);
    expect(readCreateReviewAgreementResumeId()).toBe(AGREEMENT_ID);
  });

  it("ClawProductApp rewrites /app?vs01_packet_ready=1 and intake remount does not eject", () => {
    const app = readFileSync(join(__dirname, "../ClawProductApp.tsx"), "utf8");
    expect(app).toContain("RedirectPacketReadyDashboardAwayFromList");
    expect(app).toContain("resolvePacketReadyRemountLanding");
    expect(app).toContain("isPaidProPacketReadyDashboardPath");
    expect(app).toContain("bindPacketReadyRemountResume");
    expect(app).not.toMatch(/navigate\(paidProPacketReadyDashboardPath\(\)\)/);

    const intake = readFileSync(
      join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const restoreBlock = intake.slice(
      intake.indexOf("const restoreFinalizedSignersFromPersistIfNeeded"),
      intake.indexOf("const restoreFinalizedSignersFromPersistIfNeeded") + 2400,
    );
    expect(restoreBlock).toContain("resolvePacketReadyRemountLanding");
    expect(restoreBlock).toContain("isPaidProPacketReadyDashboardPath");
    expect(restoreBlock).not.toContain("paidProPacketReadyDashboardPath");
    expect(restoreBlock).not.toMatch(/resend|sendEmail|send_mail/i);
  });
});

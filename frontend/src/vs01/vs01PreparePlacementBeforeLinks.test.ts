/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildVs01RecipientSigningUrl } from "./StepReceipt";
import {
  FIRST_FAILING_PLACEMENT_SKIP_PREDICATE,
  LINKS_READY_REQUIRES_PLACED_FIELDS_REASON,
  PLACEMENT_BEFORE_LINKS_STAY_REASON,
  canClaimPrivateSigningLinksReady,
  countPlacedSigningFields,
  resolveExistingPreparedDocumentId,
  resolvePrepareStepAfterSeed,
  resolveRemountPrepareStep,
  signingViewUsesPreparedDocument,
} from "./vs01PreparePlacementBeforeLinks";
import {
  RECIPIENT_ACCESS_TOKEN_409_STAY_REASON,
  isPaidProPacketReadyDashboardPath,
  resolvePostPrepareBuyerSurface,
  resolvePacketReadyRemountLanding,
} from "./vs01PrivateSigningLinksLanding";
import { writePaidProVs01PostSignHandoff } from "./vs01PaidProPostSignHandoff";
import { markAgreementFieldsPlacedCount } from "./vs01WorkspaceSigningStatus";
import { writeAgreementVs01BridgeSession } from "../launch/simpleProduct/agreementToVs01SigningBridge";

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";
const SEEDED_DOC = "doc_e959491fdcef431c96052cbb74e0fdaf";
const REMINTED_DOC = "doc_20948b69c43642eaa90e7baf5f73fe7f";

describe("Prepare click reaches placement before links-ready", () => {
  afterEach(() => {
    try {
      sessionStorage.clear();
      localStorage.clear();
    } catch {
      /* ignore */
    }
  });

  it("names the first failing predicate: auto-continue + goToStep(3) with 0 fields", () => {
    expect(FIRST_FAILING_PLACEMENT_SKIP_PREDICATE).toBe(
      "bridge_auto_prepare_jumps_links_ready_with_zero_placed_fields",
    );
    expect(canClaimPrivateSigningLinksReady(0)).toBe(false);
    expect(canClaimPrivateSigningLinksReady(2)).toBe(true);
    expect(countPlacedSigningFields({})).toBe(0);
    expect(
      resolvePrepareStepAfterSeed({ fieldsPlacedCount: 0 }).step,
    ).toBe(2);
    expect(resolvePrepareStepAfterSeed({ fieldsPlacedCount: 0 }).reason).toBe(
      PLACEMENT_BEFORE_LINKS_STAY_REASON,
    );
  });

  it("remount Prepare with 0 placed fields stays on placement, not goToStep(3)", () => {
    const remount = resolveRemountPrepareStep({
      agreementId: AGREEMENT_ID,
      senderPlacedCount: 0,
      recipientPlacedCount: 0,
    });
    expect(remount.step).toBe(2);
    expect(remount.fieldsPlacedCount).toBe(0);
    expect(remount.reason).toBe(PLACEMENT_BEFORE_LINKS_STAY_REASON);
    expect(canClaimPrivateSigningLinksReady(remount.fieldsPlacedCount)).toBe(false);
  });

  it("links-ready requires placed fields; stored count from a later placement unlocks step 3", () => {
    expect(canClaimPrivateSigningLinksReady(0)).toBe(false);
    expect(
      resolvePrepareStepAfterSeed({ fieldsPlacedCount: 0, packetPrepared: true }).step,
    ).toBe(2);
    markAgreementFieldsPlacedCount(AGREEMENT_ID, 4);
    const afterPlace = resolveRemountPrepareStep({ agreementId: AGREEMENT_ID });
    expect(afterPlace.fieldsPlacedCount).toBe(4);
    expect(afterPlace.step).toBe(3);
    expect(afterPlace.reason).toBe(LINKS_READY_REQUIRES_PLACED_FIELDS_REASON);
    expect(canClaimPrivateSigningLinksReady(afterPlace.fieldsPlacedCount)).toBe(true);
  });

  it("Open signing view uses the prepared document id and does not remint", () => {
    const url = buildVs01RecipientSigningUrl({
      recipientIndex: 0,
      recipientName: "Priya Shah",
      recipientEmail: "cryptocurated21+priya@gmail.com",
      counterpartyId: "owner",
      documentId: SEEDED_DOC,
      receiptId: null,
      agreementId: AGREEMENT_ID,
      signerRoleId: "vs01r:owner",
      recipientFieldsForSigner: [
        {
          id: "sig_owner",
          counterpartyId: "owner",
          type: "signature",
          page: 0,
          x: 0.1,
          y: 0.8,
          width: 0.3,
          height: 0.05,
        },
      ],
    });
    expect(signingViewUsesPreparedDocument({ seededDocumentId: SEEDED_DOC, signingUrl: url })).toBe(
      true,
    );
    expect(url).toContain(SEEDED_DOC);
    expect(url).not.toContain(REMINTED_DOC);

    writeAgreementVs01BridgeSession({
      vs01DocumentId: SEEDED_DOC,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Paid persist",
      creatorName: "Northline",
      creatorEmail: "cryptocurated21+priya@gmail.com",
      counterparties: [],
      targetStep: 2,
    });
    expect(resolveExistingPreparedDocumentId(AGREEMENT_ID)).toBe(SEEDED_DOC);
    writePaidProVs01PostSignHandoff({
      v: 1,
      agreementId: AGREEMENT_ID,
      agreementTitle: "Paid persist",
      vs01DocumentId: SEEDED_DOC,
      receiptId: "",
      receiptHashSha256: null,
      packetPrepareOnly: true,
      savedAt: "2026-08-28T21:47:00.000Z",
      signers: [
        {
          counterpartyId: "cp1",
          displayName: "Harbor",
          email: "diego@example.test",
          signingUrl: `https://lawdog.local/app/esign/${SEEDED_DOC}?s=1`,
        },
      ],
    });
    expect(resolveExistingPreparedDocumentId(AGREEMENT_ID)).toBe(SEEDED_DOC);
  });

  it("409 still does not eject to the owner dashboard", () => {
    const landing = resolvePostPrepareBuyerSurface({
      seedOk: true,
      documentId: SEEDED_DOC,
      currentPath: `/app/esign/${SEEDED_DOC}?agreement_bridge=1`,
      recipientAccessTokenStatus: 409,
    });
    expect(landing.stayOnPrivateLinks).toBe(true);
    expect(landing.navigateTo).toBeNull();
    expect(landing.reason).toBe(RECIPIENT_ACCESS_TOKEN_409_STAY_REASON);
    expect(isPaidProPacketReadyDashboardPath(landing.navigateTo ?? `/app/esign/${SEEDED_DOC}`)).toBe(
      false,
    );

    const remount = resolvePacketReadyRemountLanding({
      currentPath: `/app/esign/${SEEDED_DOC}?agreement_bridge=1`,
      documentId: SEEDED_DOC,
      packetPrepared: true,
      recipientAccessTokenStatus: 409,
    });
    expect(remount.stayOffDashboard).toBe(true);
    expect(isPaidProPacketReadyDashboardPath(remount.navigateTo ?? "")).toBe(false);
    expect(remount.reason).toBe(RECIPIENT_ACCESS_TOKEN_409_STAY_REASON);
  });

  it("wizard gates goToStep(3) on placed fields and prepare no longer auto-continues", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    const start = wizard.indexOf("const completeBridgePreparePacket = useCallback");
    expect(start).toBeGreaterThanOrEqual(0);
    const block = wizard.slice(start, wizard.indexOf("}, [", start));
    expect(block).toContain("canClaimPrivateSigningLinksReady");
    expect(block).toContain("resolvePrepareStepAfterSeed");
    expect(block).toContain("goToStep(3)");
    expect(block).toContain("FIRST_FAILING_PLACEMENT_SKIP_PREDICATE");
    expect(block).not.toContain("paidProPacketReadyDashboardPath");
    expect(block).not.toContain("dispatchSigningInvitesFromHandoff");
    expect(block).not.toMatch(/resend|sendEmail|send_mail|postSigningLinksSent/i);

    const prepare = readFileSync(join(__dirname, "StepPrepareSignature.tsx"), "utf8");
    expect(prepare).not.toContain("bridgeAutoPrepareDispatchedRef");
    expect(prepare).not.toMatch(
      /if \(!agreementBridgePlacementCopy \|\| !packetReady \|\| receiptId \|\| busy\) return;[\s\S]*handlePrepareContinue\(\)/,
    );

    const intake = readFileSync(
      join(__dirname, "../components/agreements/AgreementBuilderIntake.tsx"),
      "utf8",
    );
    const trackStart = intake.indexOf("const enterGuidedSignatureTrackRoute");
    const handoffAt = intake.indexOf("executePaidProPostRecipientSetupHandoff", trackStart);
    const trackEnd = intake.indexOf("\n  }, [", handoffAt);
    const track = intake.slice(trackStart, trackEnd > handoffAt ? trackEnd : handoffAt + 80);
    expect(track).toContain("feedbackAfterPreparePlacementOpened");
    expect(track).not.toContain("Signing links created—share when ready");
    expect(track).not.toContain("vs01_packet_ready");
    expect(track).not.toMatch(/resend|sendEmail|send_mail/i);
  });

  it("seed handoff reuses the existing vs01 document instead of reminting", () => {
    const bridge = readFileSync(
      join(__dirname, "../launch/simpleProduct/agreementToVs01SigningBridge.ts"),
      "utf8",
    );
    const start = bridge.indexOf("export async function tryNavigatePaidProAgreementSenderFirstVs01Esign");
    expect(start).toBeGreaterThanOrEqual(0);
    const seedAt = bridge.indexOf("const vs01Seed = await fetchAgreementVs01SigningSeed", start);
    const block = bridge.slice(start, seedAt > start ? seedAt : start + 4500);
    expect(block).toContain("bindReviewCorpusOntoSeededVs01Document");
    expect(block).toContain("existingDoc");
    expect(block).toContain("readPaidProVs01PostSignHandoff");
    expect(block).toContain("fetchAgreementVs01SigningSeed");
    expect(block).not.toMatch(/resend|sendEmail|send_mail/i);

    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("ensureReviewCorpusOnEsignEntry");
    const leftover = readFileSync(
      join(__dirname, "../launch/creatorDashboardPrepareSignatureLinks.ts"),
      "utf8",
    );
    expect(leftover).toContain("ensureReviewCorpusOnEsignEntry");
    expect(leftover).toContain("resolveExistingPreparedDocumentId");
  });
});

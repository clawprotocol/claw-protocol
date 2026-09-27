/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  restoreFinalizedSignerStateFromPaidReturnPersist,
} from "./paidProPaidReturnSignerFinalizedRestore";
import {
  DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN,
  firstFailingPostAcceptPrepareTrackPredicate,
  isSigningReadyPrepareTrackCorpus,
  POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON,
  resolveDecision2PrepareHandoffMinCorpusLen,
  resolvePostAcceptPrepareRequestedCta,
  resolvePostAcceptPrepareTrackCorpus,
  resolveResumeAcceptedCommercialEsignHandoff,
  shouldHandoffPostAcceptPrepareToSignatureLinks,
  shouldRecoverAcceptedCommercialPrepareTrack,
  shouldSkipReFinalizeBeforePostAcceptPrepare,
} from "./paidProPostAcceptReviewHandoff";
import { resolvePaidProStickyCta } from "./paidProStickyCta";
import {
  clearAuthoritativeSigningSnapshot,
  getAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import {
  resolveDecision2AcceptedPrepareAction,
  resolvePaidProPrepareSignaturesHandler,
} from "./paidProReviewDecisionModel";
import {
  isAuthoritativeSigningSnapshotReadyForPrepare,
  resolveFinalVs01CorpusOrBlock,
} from "../../vs01/vs01SigningCorpus";
import {
  corpusHasVisibleSignatureExecutionLines,
  corpusSignatureBlocksHaveRequiredByLines,
} from "./guidedDealCompletion/signatureRegion";
import {
  assertGuidedVs01SigningHandoffReady,
  selectGuidedSignatureTrackCorpus,
} from "./guidedDealCompletion/guidedFinalReviewToSigning";
import { GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import { GUIDED_PRO_VS01_BRIDGE_MIN_CORPUS_LEN } from "./guidedDealCompletion/guidedVs01SigningHandoff";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");
const vs01Src = readFileSync(join(here, "../../vs01/vs01SigningCorpus.ts"), "utf8");

const AGREEMENT_ID = "dd37f0e4-feba-42e5-bb37-713218aaf346";

/** Live remount paint: ends at SIGNATURES — no By / Name / Title execution lines. */
const PAINT_ONLY_CORPUS = [
  "SERVICES AGREEMENT",
  "",
  "This Agreement is between Cedar Ridge Labs LLC and Iron Quill Partners Inc.",
  "",
  ...Array.from({ length: 48 }, (_, i) => `Section ${i + 1}. Operative clause with mutual obligations.`),
  "",
  "10. NOTICES",
  "",
  "If to Cedar Ridge Labs LLC:",
  "Attn: Jordan Hale",
  "Email: jordan@example.test",
  "",
  "If to Iron Quill Partners Inc:",
  "Attn: Morgan Ellis",
  "Email: morgan@example.test",
  "",
  "11. GOVERNING LAW",
  "",
  "This Agreement is governed by the laws of the State of Texas.",
  "",
  "12. MISCELLANEOUS",
  "",
  "This Agreement constitutes the entire agreement of the parties.",
  "",
  "13. SIGNATURES",
].join("\n");

function twoAuthorizedFrozen(): FrozenSigningAuthoritySnapshotV1 {
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    agreementSessionId: "prior_tab_session",
    frozenCorpusHash: hashPaidProCorpus(PAINT_ONLY_CORPUS),
    frozenAt: new Date().toISOString(),
    parties: [
      {
        agreementPartyId: "party_0",
        legalEntityName: "Cedar Ridge Labs LLC",
        canonicalOrder: 0,
      },
      {
        agreementPartyId: "party_1",
        legalEntityName: "Iron Quill Partners Inc",
        canonicalOrder: 1,
      },
    ],
    signers: [
      {
        signerRecordId: "signer:party_0:0",
        agreementPartyId: "party_0",
        signerName: "Jordan Hale",
        signerTitle: "CEO",
        signerEmail: "jordan@example.test",
        signingOrder: 0,
        requiresSignature: true,
        requiresInitials: false,
      },
      {
        signerRecordId: "signer:party_1:0",
        agreementPartyId: "party_1",
        signerName: "Morgan Ellis",
        signerTitle: "General Counsel",
        signerEmail: "morgan@example.test",
        signingOrder: 1,
        requiresSignature: true,
        requiresInitials: false,
      },
    ],
    recipients: [],
    execution: {
      partyOrder: ["party_0", "party_1"],
      signerOrder: ["signer:party_0:0", "signer:party_1:0"],
      executionBlockHash: hashPaidProCorpus("witness"),
    },
  };
}

describe("post-accept Prepare for signing click / handoff", () => {
  afterEach(() => {
    sessionStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearFrozenSigningAuthoritySnapshotForSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("first failing predicate: remount snapshot paints but is not signing-ready", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: twoAuthorizedFrozen() }), { status: 200 }),
      ),
    );
    const restored = await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: PAINT_ONLY_CORPUS,
    });
    expect(restored.ok).toBe(true);
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(PAINT_ONLY_CORPUS).toMatch(/13\.\s+SIGNATURES/);
    expect(PAINT_ONLY_CORPUS).not.toMatch(/^By\s*:/m);
    expect(
      isAuthoritativeSigningSnapshotReadyForPrepare(readAuthoritativeSigningCorpus(), 2),
    ).toBe(false);
    expect(
      shouldSkipReFinalizeBeforePostAcceptPrepare({
        hasAuthoritativeSigningSnapshot: true,
        signerMetadataFinalizedLatch: true,
      }),
    ).toBe(true);
  });

  it("Prepare click rebuilds private-link execution lines instead of dropping the surface", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: twoAuthorizedFrozen() }), { status: 200 }),
      ),
    );
    await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: PAINT_ONLY_CORPUS,
    });

    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: PAINT_ONLY_CORPUS,
      guidedPro: true,
      signaturePreparationRequested: true,
      prepareSignatureLinksRequested: true,
    });
    expect(gate.allowed).toBe(true);
    expect(gate.blockReason).not.toBe("authoritative_signing_snapshot_not_ready");
    expect(gate.blockReason).not.toBe("corpus_too_short_for_guided_pro");
    expect(corpusSignatureBlocksHaveRequiredByLines(gate.corpus, 2)).toBe(true);
    expect(gate.corpus).toMatch(/By\s*:/i);
    expect(gate.corpus).toContain("This Agreement is between Cedar Ridge Labs LLC and Iron Quill Partners Inc.");
    expect(gate.corpus).toMatch(/laws of the State of Texas/);
    expect(gate.corpus).toMatch(/10\.\s+NOTICES/);
    expect(gate.corpus).toMatch(/13\.\s+SIGNATURES/);
    expect(shouldHandoffPostAcceptPrepareToSignatureLinks({
      hasAuthoritativeSigningSnapshot: true,
      snapshotSigningReady: false,
      prepareGateAllowed: gate.allowed,
    })).toBe(true);

    const selected = selectGuidedSignatureTrackCorpus({
      acceptedReview: readAuthoritativeSigningCorpus(),
    });
    expect(selected.source).not.toBe("none");
    expect(corpusHasVisibleSignatureExecutionLines(selected.body)).toBe(false);
  });

  it("first failing predicate after #137 allow: track reselects paint → missing_signature_block", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: twoAuthorizedFrozen() }), { status: 200 }),
      ),
    );
    await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: PAINT_ONLY_CORPUS,
    });
    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: PAINT_ONLY_CORPUS,
      guidedPro: true,
      signaturePreparationRequested: true,
      prepareSignatureLinksRequested: true,
    });
    expect(gate.allowed).toBe(true);
    expect(isSigningReadyPrepareTrackCorpus(gate.corpus, 2)).toBe(true);

    const paintReselect = selectGuidedSignatureTrackCorpus({
      finalizedSignerApplied: PAINT_ONLY_CORPUS,
      finalizedSigning: PAINT_ONLY_CORPUS,
      acceptedReview: readAuthoritativeSigningCorpus(),
    });
    const paintAssert = assertGuidedVs01SigningHandoffReady({
      manifest: getAuthoritativeSigningSnapshot()!.partyManifest,
      corpusSource: paintReselect.source,
      corpusBody: paintReselect.body,
    });
    expect(paintAssert.ok).toBe(false);
    expect(paintAssert.reason).toBe("missing_signature_block");
    expect(
      firstFailingPostAcceptPrepareTrackPredicate({
        paintCorpus: PAINT_ONLY_CORPUS,
        rebuiltCorpus: gate.corpus,
        signerCount: 2,
        partyManifest: getAuthoritativeSigningSnapshot()!.partyManifest,
      }),
    ).toBe("missing_signature_block");
  });

  it("Prepare click uses rebuilt corpus so signing-links route is ready, not empty prepare_signing bar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: twoAuthorizedFrozen() }), { status: 200 }),
      ),
    );
    await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: PAINT_ONLY_CORPUS,
    });
    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: PAINT_ONLY_CORPUS,
      guidedPro: true,
      signaturePreparationRequested: true,
      prepareSignatureLinksRequested: true,
    });
    expect(gate.allowed).toBe(true);

    const selected = resolvePostAcceptPrepareTrackCorpus({
      rebuiltSigningCorpus: gate.corpus,
      rebuiltSignerCount: 2,
      finalizedSignerApplied: PAINT_ONLY_CORPUS,
      finalizedSigning: PAINT_ONLY_CORPUS,
      acceptedReview: readAuthoritativeSigningCorpus(),
    });
    expect(selected.source).toBe("finalized_signer_applied_guided_corpus");
    expect(selected.body).toBe(gate.corpus.trim());
    expect(corpusHasVisibleSignatureExecutionLines(selected.body)).toBe(true);
    expect(corpusSignatureBlocksHaveRequiredByLines(selected.body, 2)).toBe(true);
    expect(
      assertGuidedVs01SigningHandoffReady({
        manifest: getAuthoritativeSigningSnapshot()!.partyManifest,
        corpusSource: selected.source,
        corpusBody: selected.body,
      }).ok,
    ).toBe(true);

    const leftoverSticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: true,
      sendSurfaceReady: false,
    });
    expect(leftoverSticky.phase).toBe("prepare_signing");
    expect(leftoverSticky.label).toBe("");
    expect(leftoverSticky.disabled).toBe(true);
    const leftoverCta = resolvePostAcceptPrepareRequestedCta({
      signaturePreparationRequested: true,
      sendSurfaceReady: false,
      stickyPhase: leftoverSticky.phase,
    });
    expect(leftoverCta).not.toBeNull();
    expect(leftoverCta?.disabled).toBe(false);
    expect((leftoverCta?.label || "").trim().length).toBeGreaterThan(0);
    expect(leftoverCta?.reason).toBe(POST_ACCEPT_CONTINUE_TO_SIGNATURE_LINKS_REASON);

    expect(intakeSrc).toContain("resolvePostAcceptPrepareTrackCorpus");
    expect(intakeSrc).toContain("resolvePostAcceptPrepareRequestedCta");
    expect(intakeSrc).toContain("signingLinksSurfaceReached");
    expect(intakeSrc).toMatch(
      /if \(!signingLinksSurfaceReached && hasAuthoritativeSigningSnapshot\(\)\)/,
    );
    const trackStartForRebuild = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute");
    const trackEndForRebuild = intakeSrc.indexOf(
      "const completeGuidedSigningHandoff = React.useCallback",
      trackStartForRebuild,
    );
    const trackBlock = intakeSrc.slice(
      trackStartForRebuild,
      trackEndForRebuild > trackStartForRebuild ? trackEndForRebuild : trackStartForRebuild + 28000,
    );
    expect(trackBlock).toContain("resolvePostAcceptPrepareTrackCorpus");
    expect(trackBlock).toContain("rebuiltSigningCorpus: corpusText");
    expect(trackBlock).not.toMatch(/resend|sendEmail|send_mail/i);
  });

  it("decision_2 Prepare after accept 200 recovers empty paint refs and is ready for /app/esign/doc_*", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: twoAuthorizedFrozen() }), { status: 200 }),
      ),
    );
    await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: PAINT_ONLY_CORPUS,
    });
    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: PAINT_ONLY_CORPUS,
      guidedPro: true,
      signaturePreparationRequested: true,
      prepareSignatureLinksRequested: true,
    });
    expect(gate.allowed).toBe(true);
    const snap = getAuthoritativeSigningSnapshot();
    expect(snap).not.toBeNull();
    const recovered = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      verifiedDisplayCorpus: PAINT_ONLY_CORPUS,
      signingSnapshotCorpus: PAINT_ONLY_CORPUS,
      acceptedReviewCorpus: "",
      rebuiltSigningCorpus: gate.corpus,
      partyManifest: snap!.partyManifest,
      signerCount: 2,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) throw new Error(recovered.reason);
    expect(recovered.body.length).toBeGreaterThan(500);
    expect(isSigningReadyPrepareTrackCorpus(recovered.body, 2)).toBe(true);
    expect(
      assertGuidedVs01SigningHandoffReady({
        manifest: snap!.partyManifest,
        corpusSource: recovered.source,
        corpusBody: recovered.body,
      }).ok,
    ).toBe(true);

    const blocked = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: false,
      rebuiltSigningCorpus: gate.corpus,
      partyManifest: snap!.partyManifest,
      signerCount: 2,
    });
    expect(blocked.ok).toBe(false);
    if (blocked.ok) throw new Error("expected fail closed");
    expect(blocked.reason).toBe("accepted_snapshot_missing");

    const emptySigners = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      rebuiltSigningCorpus: gate.corpus,
      partyManifest: { parties: [] },
      signerCount: 2,
    });
    expect(emptySigners.ok).toBe(false);

    expect(intakeSrc).toContain("resolveResumeAcceptedCommercialEsignHandoff");
    expect(intakeSrc).toContain("enterGuidedSignatureTrackRoute:accepted_snapshot_recover");
    const prepareClick = intakeSrc.slice(
      intakeSrc.indexOf("onPrepareSignatures={() => {"),
      intakeSrc.indexOf("onPrepareSignatures={() => {") + 700,
    );
    expect(prepareClick).toContain("phase: paidProReviewDecisionPhase");
    expect(prepareClick).toContain("onDecision2: () =>");
    expect(prepareClick).toContain("handlePaidProPrepareSignaturesFromFirstReview");
    const sendClick = intakeSrc.slice(
      intakeSrc.indexOf("onSendForSignature={() => {"),
      intakeSrc.indexOf("onSendForSignature={() => {") + 700,
    );
    expect(sendClick).toContain("handlePaidProPrepareSignaturesFromFirstReview");
    const trackStart = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute");
    const trackEnd = intakeSrc.indexOf("const completeGuidedSigningHandoff = React.useCallback", trackStart);
    const trackFrag = intakeSrc.slice(trackStart, trackEnd > trackStart ? trackEnd : trackStart + 24000);
    expect(trackFrag).toContain("resolveResumeAcceptedCommercialEsignHandoff");
    expect(trackFrag).toContain("ensureAcceptedCommercialReviewForEsignHandoff");
    expect(trackFrag).toContain("executePaidProPostRecipientSetupHandoff");
    expect(trackFrag).toContain("enterGuidedSignatureTrackRoute:handoff_ok");
    expect(trackFrag).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(trackFrag).not.toMatch(/\bstripe\b|checkout/i);
  });

  it("decision_2 Prepare after already-accepted GET snapshot recovers paint refs and would navigate", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ snapshot: twoAuthorizedFrozen() }), { status: 200 }),
      ),
    );
    await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: PAINT_ONLY_CORPUS,
    });
    const gate = resolveFinalVs01CorpusOrBlock({
      agreementCorpusText: PAINT_ONLY_CORPUS,
      guidedPro: true,
      signaturePreparationRequested: true,
      prepareSignatureLinksRequested: true,
    });
    expect(gate.allowed).toBe(true);
    const snap = getAuthoritativeSigningSnapshot();
    expect(snap).not.toBeNull();

    // Live #182 hole: Continue already painted Review, so transition.ok && corpusText.
    // The old gate skipped recover; this click must still recover and be handoff-ready.
    const oldGateWouldSkipRecover =
      Boolean(true) && Boolean(PAINT_ONLY_CORPUS.trim());
    expect(oldGateWouldSkipRecover).toBe(true);
    expect(
      shouldRecoverAcceptedCommercialPrepareTrack({
        acceptedSnapshotEnabled: true,
        transitionOk: true,
        corpusText: PAINT_ONLY_CORPUS,
      }),
    ).toBe(true);
    expect(
      shouldRecoverAcceptedCommercialPrepareTrack({
        acceptedSnapshotEnabled: false,
        transitionOk: true,
        corpusText: PAINT_ONLY_CORPUS,
      }),
    ).toBe(false);

    const recovered = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      verifiedDisplayCorpus: PAINT_ONLY_CORPUS,
      signingSnapshotCorpus: PAINT_ONLY_CORPUS,
      acceptedReviewCorpus: PAINT_ONLY_CORPUS,
      rebuiltSigningCorpus: gate.corpus,
      partyManifest: snap!.partyManifest,
      signerCount: 2,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) throw new Error(recovered.reason);
    expect(isSigningReadyPrepareTrackCorpus(recovered.body, 2)).toBe(true);
    expect(
      assertGuidedVs01SigningHandoffReady({
        manifest: snap!.partyManifest,
        corpusSource: recovered.source,
        corpusBody: recovered.body,
      }).ok,
    ).toBe(true);

    const emptySigners = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      rebuiltSigningCorpus: gate.corpus,
      partyManifest: { parties: [] },
      signerCount: 2,
    });
    expect(emptySigners.ok).toBe(false);

    expect(
      resolveDecision2AcceptedPrepareAction({
        phase: "decision_2",
        acceptedSnapshotEnabled: true,
        signerDetailsComplete: true,
      }),
    ).toBe("enter_esign_track");

    expect(intakeSrc).toContain("shouldRecoverAcceptedCommercialPrepareTrack");
    expect(intakeSrc).toContain("resolveDecision2AcceptedPrepareAction");
    const prepareFrag = intakeSrc.slice(
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview = React.useCallback"),
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview = React.useCallback") + 5500,
    );
    const enterIdx = prepareFrag.indexOf('prepareAction === "enter_esign_track"');
    const remountIdx = prepareFrag.indexOf("canMountPaidProInlineSignerSetupFromFirstReview");
    expect(enterIdx).toBeGreaterThan(0);
    expect(remountIdx).toBeGreaterThan(enterIdx);
    expect(prepareFrag).toContain("void handleProSendForSignature()");
    const trackStart = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute");
    const trackEnd = intakeSrc.indexOf("const completeGuidedSigningHandoff = React.useCallback", trackStart);
    const trackFrag = intakeSrc.slice(trackStart, trackEnd > trackStart ? trackEnd : trackStart + 24000);
    expect(trackFrag).toContain("shouldRecoverAcceptedCommercialPrepareTrack");
    expect(trackFrag).toContain("enterGuidedSignatureTrackRoute:accepted_snapshot_recover");
    expect(trackFrag).toContain("enterGuidedSignatureTrackRoute:handoff_ok");
    expect(trackFrag).toContain("executePaidProPostRecipientSetupHandoff");
    expect(trackFrag).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(trackFrag).not.toMatch(/\bstripe\b|checkout/i);
    // Recover reassignment widens selected.source; last "none" guard must
    // precede mapTrackCorpusSourceToHandoffSource so TS2345 cannot return.
    const lastNoneGuard = trackFrag.lastIndexOf('selected.source === "none"');
    const mapHandoffSource = trackFrag.indexOf("mapTrackCorpusSourceToHandoffSource(selected.source)");
    expect(lastNoneGuard).toBeGreaterThan(0);
    expect(mapHandoffSource).toBeGreaterThan(lastNoneGuard);
  });

  it("decision_2 / Continue click still uses last-good Prepare → signature track", () => {
    const calls: string[] = [];
    const handler = resolvePaidProPrepareSignaturesHandler({
      phase: "decision_2",
      onDecision1: () => calls.push("first_review"),
      onDecision2: () => calls.push("send_for_signature"),
      onFallback: () => calls.push("fallback"),
    });
    handler();
    expect(calls).toEqual(["send_for_signature"]);

    const sendBlock = intakeSrc.slice(
      intakeSrc.indexOf("const handleProSendForSignature"),
      intakeSrc.indexOf("const handlePaidProPrepareSignaturesFromFirstReview"),
    );
    expect(sendBlock).toContain("markSigningPreparationRequested()");
    expect(sendBlock).toContain("enterGuidedSignatureTrackRoute");
    expect(intakeSrc).toContain("readAuthoritativeSigningCorpus()");
    expect(vs01Src).toContain("isAuthoritativeSigningSnapshotReadyForPrepare");
    expect(vs01Src).toContain("ensureVs01SigningCorpusWitnessBlock");
    expect(vs01Src).not.toMatch(
      /blockReason:\s*allowed \? undefined : "authoritative_signing_snapshot_not_ready"/,
    );
    const trackStartDecision2 = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute");
    const trackEndDecision2 = intakeSrc.indexOf(
      "const completeGuidedSigningHandoff = React.useCallback",
      trackStartDecision2,
    );
    const trackBlock = intakeSrc.slice(
      trackStartDecision2,
      trackEndDecision2 > trackStartDecision2 ? trackEndDecision2 : trackStartDecision2 + 28000,
    );
    expect(trackBlock).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(trackBlock).not.toMatch(/\bstripe\b|checkout/i);
  });

  it("remount Prepare seed success stays on private-links; vs01_packet_ready does not win", () => {
    const wizard = readFileSync(join(here, "../../vs01/Vs01Wizard.tsx"), "utf8");
    const trackStart = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute");
    const handoffAt = intakeSrc.indexOf("executePaidProPostRecipientSetupHandoff", trackStart);
    expect(handoffAt).toBeGreaterThan(trackStart);
    const trackEnd = intakeSrc.indexOf("\n  }, [", handoffAt);
    const trackBlock = intakeSrc.slice(trackStart, trackEnd > handoffAt ? trackEnd : handoffAt + 80);
    expect(trackBlock).toContain("executePaidProPostRecipientSetupHandoff");
    expect(trackBlock).not.toContain("vs01_packet_ready");
    expect(wizard).toContain("resolvePostPrepareBuyerSurface");
    expect(wizard).toContain("[vs01-private-signing-links-stay]");
    const prepareBlock = wizard.slice(
      wizard.indexOf("const completeBridgePreparePacket = useCallback"),
      wizard.indexOf("const completeBridgePreparePacket = useCallback") + 3800,
    );
    expect(prepareBlock).toContain("goToStep(3)");
    expect(prepareBlock).not.toContain("paidProPacketReadyDashboardPath");
    expect(prepareBlock).not.toMatch(/resend|sendEmail|postSigningLinksSent/i);
  });
});

/** Live 4e18814c accepted display / track lengths from CDP on index-A1PM84JJ.js. */
const LIVE_4E18814C_DISPLAY_LEN = 1831;
const LIVE_4E18814C_HANDOFF_LEN = 1920;

function cedarBluePartyManifest() {
  return {
    parties: [
      {
        index: 0,
        role: "client" as const,
        partyName: "Cedar Peak Design LLC",
        email: "cryptocurated21+cedar.peak@gmail.com",
        signerName: "Alex Rivera",
        signerTitle: "Managing Member",
        roleLabel: "Client",
        signerKind: "entity_representative" as const,
        isSenderSide: true,
        isIndividual: false,
      },
      {
        index: 1,
        role: "service_provider" as const,
        partyName: "Blue Harbor Media Inc",
        email: "cryptocurated21+blue.harbor@gmail.com",
        signerName: "Jordan Lee",
        signerTitle: "VP Operations",
        roleLabel: "Service Provider",
        signerKind: "entity_representative" as const,
        isSenderSide: false,
        isIndividual: false,
      },
    ],
  };
}

function buildCedarPeakCommercialCorpus(opts: {
  targetLen: number;
  signingReady: boolean;
}): string {
  const head = `SERVICES AGREEMENT

This Agreement is entered into as of the Effective Date by and between Cedar Peak Design LLC ("Client") and Blue Harbor Media Inc ("Service Provider").

1. SERVICES
Service Provider shall perform brand, media, and design services described in each statement of work.

2. FEES AND PAYMENT
Client shall pay the fees set forth in the applicable statement of work within thirty days of invoice.

3. TERM AND TERMINATION
This Agreement commences on the Effective Date and continues until the work is complete.

4. CONFIDENTIALITY
Each party shall protect the other party's confidential information with reasonable care.

5. INTELLECTUAL PROPERTY
Upon payment, work product is assigned to Client, subject to Service Provider's pre-existing tools.

6. GOVERNING LAW
This Agreement is governed by the laws of the State of Texas.

7. ENTIRE AGREEMENT
This Agreement constitutes the entire agreement of the parties.

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Cedar Peak Design LLC
Alex Rivera
Managing Member
cryptocurated21+cedar.peak@gmail.com`;
  const readyTail = `By: ____________________
Date: ____________________

SERVICE PROVIDER:
Blue Harbor Media Inc
Jordan Lee
VP Operations
cryptocurated21+blue.harbor@gmail.com
By: ____________________
Date: ____________________`;
  const paintTail = `SERVICE PROVIDER:
Blue Harbor Media Inc
Jordan Lee
VP Operations
cryptocurated21+blue.harbor@gmail.com`;
  const tail = opts.signingReady ? readyTail : paintTail;
  const sep = "\n\n";
  const reserved = sep.length + tail.length;
  let prefix = head;
  const filler = " Commercial implementation details.";
  if (prefix.length + reserved > opts.targetLen) {
    prefix = prefix.slice(0, Math.max(0, opts.targetLen - reserved));
  } else {
    while (prefix.length + reserved < opts.targetLen) {
      prefix += filler;
    }
    prefix = prefix.slice(0, opts.targetLen - reserved);
  }
  return `${prefix}${sep}${tail}`;
}

const HOLLOW_STARTER_CORPUS = `[Your Company Name] and [Client Name]

1. Services
The provider will perform the services.

2. Fees
Fees are due on invoice.

CLIENT:
[Your Company Name]
By: ____________________

SERVICE PROVIDER:
[Client Name]
By: ____________________`;

describe("Decision-2 Prepare: live 1920 corpus_too_short vs 2000 gate", () => {
  it("aligns accepted-resume minLen with the 1500 commercial Prepare/bridge floor", () => {
    expect(DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN).toBe(GUIDED_PRO_VS01_BRIDGE_MIN_CORPUS_LEN);
    expect(DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN).toBe(1500);
    expect(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN).toBe(2000);
    expect(resolveDecision2PrepareHandoffMinCorpusLen(true)).toBe(1500);
    expect(resolveDecision2PrepareHandoffMinCorpusLen(false)).toBe(2000);
  });

  it("default 2000 assert rejects the live 1920 packet; Decision-2 1500 assert proceeds", () => {
    const live1920 = buildCedarPeakCommercialCorpus({
      targetLen: LIVE_4E18814C_HANDOFF_LEN,
      signingReady: true,
    });
    expect(live1920.length).toBe(LIVE_4E18814C_HANDOFF_LEN);
    expect(live1920.length).toBeGreaterThanOrEqual(DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN);
    expect(live1920.length).toBeLessThan(GUIDED_SIGNING_AUTHORITATIVE_MIN_LEN);
    expect(isSigningReadyPrepareTrackCorpus(live1920, 2)).toBe(true);

    const liveGate = assertGuidedVs01SigningHandoffReady({
      manifest: cedarBluePartyManifest(),
      corpusSource: "accepted_review",
      corpusBody: live1920,
    });
    expect(liveGate.ok).toBe(false);
    expect(liveGate.reason).toBe("corpus_too_short");

    const decision2Gate = assertGuidedVs01SigningHandoffReady({
      manifest: cedarBluePartyManifest(),
      corpusSource: "accepted_review",
      corpusBody: live1920,
      minCorpusLen: DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN,
    });
    expect(decision2Gate.ok).toBe(true);
  });

  it("accepted commercial ~1920 resume proceeds to handoff-ready; hollow/empty stay closed", () => {
    const display1831 = buildCedarPeakCommercialCorpus({
      targetLen: LIVE_4E18814C_DISPLAY_LEN,
      signingReady: false,
    });
    const live1920 = buildCedarPeakCommercialCorpus({
      targetLen: LIVE_4E18814C_HANDOFF_LEN,
      signingReady: true,
    });
    expect(display1831.length).toBe(LIVE_4E18814C_DISPLAY_LEN);
    expect(live1920.length).toBe(LIVE_4E18814C_HANDOFF_LEN);

    const recovered = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      verifiedDisplayCorpus: display1831,
      signingSnapshotCorpus: display1831,
      acceptedReviewCorpus: display1831,
      rebuiltSigningCorpus: live1920,
      partyManifest: cedarBluePartyManifest(),
      signerCount: 2,
    });
    expect(recovered.ok).toBe(true);
    if (!recovered.ok) throw new Error(recovered.reason);
    expect(recovered.body.length).toBe(LIVE_4E18814C_HANDOFF_LEN);
    expect(isSigningReadyPrepareTrackCorpus(recovered.body, 2)).toBe(true);
    expect(
      assertGuidedVs01SigningHandoffReady({
        manifest: cedarBluePartyManifest(),
        corpusSource: recovered.source,
        corpusBody: recovered.body,
        minCorpusLen: resolveDecision2PrepareHandoffMinCorpusLen(true),
      }).ok,
    ).toBe(true);

    const tooShortForCommercialFloor = buildCedarPeakCommercialCorpus({
      targetLen: DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN - 1,
      signingReady: true,
    });
    expect(tooShortForCommercialFloor.length).toBe(DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN - 1);
    const belowFloor = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      rebuiltSigningCorpus: tooShortForCommercialFloor,
      partyManifest: cedarBluePartyManifest(),
      signerCount: 2,
    });
    expect(belowFloor.ok).toBe(false);
    if (belowFloor.ok) throw new Error("expected fail closed");
    expect(belowFloor.reason).toBe("corpus_too_short");

    const hollow = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      rebuiltSigningCorpus: HOLLOW_STARTER_CORPUS,
      partyManifest: cedarBluePartyManifest(),
      signerCount: 2,
    });
    expect(hollow.ok).toBe(false);
    if (hollow.ok) throw new Error("expected hollow fail closed");
    expect(hollow.reason).toBe("corpus_too_short");
    expect(HOLLOW_STARTER_CORPUS.length).toBeLessThan(DECISION2_ACCEPTED_PREPARE_MIN_CORPUS_LEN);

    const emptySigners = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: true,
      rebuiltSigningCorpus: live1920,
      partyManifest: { parties: [] },
      signerCount: 2,
    });
    expect(emptySigners.ok).toBe(false);

    const noAccepted = resolveResumeAcceptedCommercialEsignHandoff({
      agreementId: "4e18814c-c8fe-4eb9-85ae-a3e694cb596e",
      acceptedSnapshotEnabled: false,
      rebuiltSigningCorpus: live1920,
      partyManifest: cedarBluePartyManifest(),
      signerCount: 2,
    });
    expect(noAccepted.ok).toBe(false);
    if (noAccepted.ok) throw new Error("expected fail closed");
    expect(noAccepted.reason).toBe("accepted_snapshot_missing");

    expect(intakeSrc).toContain("resolveDecision2PrepareHandoffMinCorpusLen");
    expect(intakeSrc).toContain("minCorpusLen: decision2HandoffMinLen");
    const trackStart = intakeSrc.indexOf("const enterGuidedSignatureTrackRoute");
    const trackEnd = intakeSrc.indexOf("const completeGuidedSigningHandoff = React.useCallback", trackStart);
    const trackFrag = intakeSrc.slice(trackStart, trackEnd > trackStart ? trackEnd : trackStart + 24000);
    expect(trackFrag).toContain("resolveDecision2PrepareHandoffMinCorpusLen(acceptedEnabled)");
    expect(trackFrag).toContain("minCorpusLen: decision2HandoffMinLen");
    expect(trackFrag).toContain("enterGuidedSignatureTrackRoute:handoff_ok");
    expect(trackFrag).not.toMatch(/resend|sendEmail|send_mail/i);
  });
});

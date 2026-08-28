/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  restoreFinalizedSignerStateFromPaidReturnPersist,
} from "./paidProPaidReturnSignerFinalizedRestore";
import {
  shouldHandoffPostAcceptPrepareToSignatureLinks,
  shouldSkipReFinalizeBeforePostAcceptPrepare,
} from "./paidProPostAcceptReviewHandoff";
import {
  clearAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { resolvePaidProPrepareSignaturesHandler } from "./paidProReviewDecisionModel";
import {
  isAuthoritativeSigningSnapshotReadyForPrepare,
  resolveFinalVs01CorpusOrBlock,
} from "../../vs01/vs01SigningCorpus";
import { corpusSignatureBlocksHaveRequiredByLines } from "./guidedDealCompletion/signatureRegion";
import { selectGuidedSignatureTrackCorpus } from "./guidedDealCompletion/guidedFinalReviewToSigning";

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
    const trackBlock = intakeSrc.slice(
      intakeSrc.indexOf("const enterGuidedSignatureTrackRoute"),
      intakeSrc.indexOf("const enterGuidedSignatureTrackRoute") + 1800,
    );
    expect(trackBlock).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(trackBlock).not.toMatch(/stripe|checkout|premiumCompletion/i);
  });
});

/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAuthoritativeSigningSnapshotFromFrozenPersist,
  persistHasTwoAuthorizedSigners,
  restoreFinalizedSignerStateFromPaidReturnPersist,
  shouldRestoreFinalizedSignerStateOnPaidReturnRemount,
} from "./paidProPaidReturnSignerFinalizedRestore";
import {
  resolvePostAcceptReviewHandoffCta,
  shouldSkipReFinalizeBeforePostAcceptPrepare,
} from "./paidProPostAcceptReviewHandoff";
import { resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress } from "./paidProFirstReviewSignerSetupTransition";
import { DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA } from "./signerSetupPartyIdentity";
import {
  clearAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  hasFrozenSigningAuthoritySnapshot,
  type FrozenSigningAuthoritySnapshotV1,
} from "./frozenSigningAuthoritySnapshot";
import { hashPaidProCorpus } from "./paidProSourceOfTruth";
import { resolvePaidProStickyCta } from "./paidProStickyCta";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");
const restoreSrc = readFileSync(join(here, "paidProPaidReturnSignerFinalizedRestore.ts"), "utf8");
const snapSrc = readFileSync(join(here, "authoritativeSigningSnapshot.ts"), "utf8");

const AGREEMENT_ID = "ag_paid_return_remount_restore";
const CORPUS = [
  "SERVICES AGREEMENT",
  "",
  "This Agreement is between Cedar Ridge Labs LLC and Iron Quill Partners Inc.",
  "",
  ...Array.from({ length: 40 }, (_, i) => `Section ${i + 1}. Operative clause.`),
  "",
  "If to Cedar Ridge Labs LLC:",
  "Attn: Jordan Hale",
  "Email: jordan@example.test",
  "",
  "If to Iron Quill Partners Inc:",
  "Attn: Morgan Ellis",
  "Email: morgan@example.test",
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
].join("\n");

function twoAuthorizedFrozen(overrides?: Partial<FrozenSigningAuthoritySnapshotV1>): FrozenSigningAuthoritySnapshotV1 {
  return {
    version: 1,
    agreementId: AGREEMENT_ID,
    agreementSessionId: "prior_tab_session",
    frozenCorpusHash: hashPaidProCorpus(CORPUS),
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
    ...overrides,
  };
}

describe("paid-return remount lost in-memory latch (path #135 missed)", () => {
  afterEach(() => {
    sessionStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearFrozenSigningAuthoritySnapshotForSession();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("first failing predicate: remount drops snapshot + latch while persist already finalized", () => {
    expect(
      shouldRestoreFinalizedSignerStateOnPaidReturnRemount({
        hasAuthoritativeSigningSnapshot: false,
        signerMetadataFinalizedLatch: false,
        persistAccepted: true,
        frozenHasTwoAuthorizedSigners: true,
      }),
    ).toBe(true);
    expect(hasAuthoritativeSigningSnapshot()).toBe(false);
  });

  it("does not restore when #135 in-session latch or snapshot is still live", () => {
    expect(
      shouldRestoreFinalizedSignerStateOnPaidReturnRemount({
        hasAuthoritativeSigningSnapshot: true,
        signerMetadataFinalizedLatch: false,
        persistAccepted: true,
        frozenHasTwoAuthorizedSigners: true,
      }),
    ).toBe(false);
    expect(
      shouldRestoreFinalizedSignerStateOnPaidReturnRemount({
        hasAuthoritativeSigningSnapshot: false,
        signerMetadataFinalizedLatch: true,
        persistAccepted: true,
        frozenHasTwoAuthorizedSigners: true,
      }),
    ).toBe(false);
  });

  it("does not restore without accept or two authorized signers", () => {
    expect(
      shouldRestoreFinalizedSignerStateOnPaidReturnRemount({
        hasAuthoritativeSigningSnapshot: false,
        signerMetadataFinalizedLatch: false,
        persistAccepted: false,
        frozenHasTwoAuthorizedSigners: true,
      }),
    ).toBe(false);
    expect(
      shouldRestoreFinalizedSignerStateOnPaidReturnRemount({
        hasAuthoritativeSigningSnapshot: false,
        signerMetadataFinalizedLatch: false,
        persistAccepted: true,
        frozenHasTwoAuthorizedSigners: false,
      }),
    ).toBe(false);
    expect(persistHasTwoAuthorizedSigners(null)).toBe(false);
    const incomplete = twoAuthorizedFrozen();
    incomplete.signers[1] = { ...incomplete.signers[1]!, signerName: "", signerEmail: "not-an-email" };
    expect(persistHasTwoAuthorizedSigners(incomplete)).toBe(false);
  });

  it("reinstalls snapshot from persist frozen authority without a frozen/draft POST", async () => {
    const frozen = twoAuthorizedFrozen();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ snapshot: frozen }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    expect(hasAuthoritativeSigningSnapshot()).toBe(false);
    const restored = await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: CORPUS,
      signerMetadataFinalizedLatch: false,
    });
    expect(restored.ok).toBe(true);
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(hasFrozenSigningAuthoritySnapshot()).toBe(true);
    if (restored.ok) {
      expect(restored.ui.partySignerNames).toEqual(["Jordan Hale", "Morgan Ellis"]);
      expect(restored.ui.recipient1Email).toBe("jordan@example.test");
      expect(restored.ui.recipient2Email).toBe("morgan@example.test");
    }

    const methods = fetchMock.mock.calls.map((c) => String(c[1]?.method ?? "GET").toUpperCase());
    expect(methods.every((m) => m === "GET")).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("/frozen-signing-authority"))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => /\/api\/agreements\/?$/.test(String(c[0])))).toBe(false);
  });

  it("after remount restore, Continue / Prepare paints — not Add signer details", async () => {
    const frozen = twoAuthorizedFrozen();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ snapshot: frozen }), { status: 200 })),
    );
    await restoreFinalizedSignerStateFromPaidReturnPersist({
      agreementId: AGREEMENT_ID,
      persistAccepted: true,
      corpus: CORPUS,
      signerMetadataFinalizedLatch: false,
    });

    expect(resolvePaidProFirstReviewPrimaryCtaAfterSignerProgress({
      signersReady: true,
      signerMetadataFinalized: true,
    })).toBe("prepare_for_signing");

    const sticky = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: true,
      signerDetailsComplete: true,
      inlineSignerSetupLatched: false,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    const restoredCta = resolvePostAcceptReviewHandoffCta({
      signerDetailsComplete: true,
      signerMetadataFinalized: true,
      signaturePreparationRequested: false,
      reviewDecisionChromeVisible: false,
      stickyPhase: sticky.phase,
    });
    expect(restoredCta?.label).toBe(DASHBOARD_SIGNER_SETUP_RESUME_COMPLETE_CTA);
    expect(restoredCta?.label).toBe("Continue to signature links");
    expect(shouldSkipReFinalizeBeforePostAcceptPrepare({
      hasAuthoritativeSigningSnapshot: true,
      signerMetadataFinalizedLatch: true,
    })).toBe(true);
  });

  it("rebuilds snapshot bytes from persist corpus + frozen signers", () => {
    const frozen = twoAuthorizedFrozen();
    const snap = buildAuthoritativeSigningSnapshotFromFrozenPersist({ corpus: CORPUS, frozen });
    expect(snap?.signerMetadata.partySignerNames).toEqual(["Jordan Hale", "Morgan Ellis"]);
    expect(snap?.signerMetadata.recipient1Email).toBe("jordan@example.test");
    expect(snap?.corpus).toContain("Attn: Jordan Hale");
    expect(snap?.source).toBe("paid_pro_signer_metadata_finalize");
  });

  it("intake restores persist-finalized signers on paid-return remount without mail or Stripe", () => {
    expect(intakeSrc).toContain("restoreFinalizedSignerStateFromPaidReturnPersist");
    expect(intakeSrc).toContain("restoreFinalizedSignersFromPersistIfNeeded");
    expect(restoreSrc).toContain("PAID_RETURN_SIGNER_FINALIZED_RESTORE_REASON");
    expect(restoreSrc).toContain("paid_return_remount_persist_finalized_signers");
    expect(snapSrc).toContain("installAuthoritativeSigningSnapshotFromPersist");
    expect(snapSrc).toContain("paid_return_remount_restore");
    const restoreBlock = intakeSrc.slice(
      intakeSrc.indexOf("const restoreFinalizedSignersFromPersistIfNeeded"),
      intakeSrc.indexOf("const restoreFinalizedSignersFromPersistIfNeeded") + 1800,
    );
    expect(restoreBlock).not.toMatch(/resend|sendEmail|send_mail/i);
    expect(restoreBlock).not.toMatch(/stripe|checkout|premiumCompletion/i);
    expect(restoreBlock).not.toMatch(/persistFrozenSigningAuthorityToBackend/);
    expect(intakeSrc).toContain("void restoreFinalizedSignersFromPersistIfNeeded(agreementId, serverCorpus)");
    expect(intakeSrc).toContain("shouldSkipReFinalizeBeforePostAcceptPrepare");
  });
});

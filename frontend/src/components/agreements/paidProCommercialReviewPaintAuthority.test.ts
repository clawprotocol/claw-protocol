/** @vitest-environment jsdom */
/**
 * Patch 5B adversarial paint authority — commercial review must not paint legal corpus
 * until verified GET /canonical-review-snapshot matches display authority.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canEnableCommercialPrepareFromServerSnapshot,
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  hasVerifiedCommercialDisplayCorpus,
  readVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
  storeAcceptedReviewSnapshotRef,
  storeDisplayReviewSnapshotAuthority,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { hasPaidProChromeAuthority } from "./premiumApiHandoff";
import {
  resolvePaidProFirstReviewVisibleDisplayPlain,
} from "./paidProFirstReviewDisplayAuthority";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  clearPremiumCompletionSnapshot,
  persistPremiumCompletionSnapshot,
} from "./premiumCompletionStorage";
import {
  PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";

const AGREEMENT_ID = "ag_patch5b_paint";
const SNAPSHOT_ID = "crs_patch5b_paint";

function buildServerCorpus(marker = "SERVER_GET_AUTHORITY_MARKER"): string {
  const pad = "The parties agree to cooperate in good faith on the engagement terms. ".repeat(80);
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "This Agreement is entered into as of the Effective Date by and between Blue Canyon Analytics LLC and Iron Vale Systems Inc.",
    "1. SCOPE OF SERVICES",
    "1.1 Provider shall deliver consulting and implementation services.",
    marker,
    "8. GENERAL PROVISIONS",
    "9. MISCELLANEOUS",
    "10. INDEPENDENT CONTRACTOR AND ACCESS",
    "11. WARRANTIES AND COMPLIANCE",
    pad,
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: Michael Torres",
    "Title: President",
  ].join("\n\n");
}

const TAMPERED_LOCAL = buildServerCorpus("TAMPERED_LOCAL_COMPLETION_SNAP");
const SOT_LOCAL = buildServerCorpus("LOCAL_SOT_MUST_NOT_PAINT");
const SERVER_CORPUS = buildServerCorpus("SERVER_GET_AUTHORITY_MARKER");

async function seedVerifiedServerCorpus(args?: {
  agreementId?: string;
  corpus?: string;
  status?: string;
  snapshotId?: string;
}): Promise<void> {
  const agreementId = args?.agreementId ?? AGREEMENT_ID;
  const corpus = (args?.corpus ?? SERVER_CORPUS).trim();
  const snapshotId = args?.snapshotId ?? SNAPSHOT_ID;
  const sha = await sha256CorpusDigest(corpus);
  storeVerifiedCommercialDisplayCorpus({
    agreementId,
    snapshotId,
    corpusSha256: sha,
    corpusLength: corpus.length,
    status: args?.status ?? "pending",
    corpusPlain: corpus,
  });
}

describe("Patch 5B commercial review paint authority", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
    clearPremiumCompletionSnapshot();
    clearAcceptedReviewSnapshotRef();
    clearDisplayReviewSnapshotAuthority();
    vi.restoreAllMocks();
  });

  it("tampered/stale premium completion snapshot cannot paint review corpus before GET", () => {
    persistPremiumCompletionSnapshot({
      premiumDraft: {
        title: "Tampered",
        parties: [],
        services: "tampered",
        premium_full_document_text: TAMPERED_LOCAL,
      } as never,
      premiumParties: [],
      recipientCandidates: [],
      premiumWinningBodyText: TAMPERED_LOCAL,
      premiumReadonlyPlainText: TAMPERED_LOCAL,
    });
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      pickerPlain: TAMPERED_LOCAL,
      pickerSource: "premium_completion_snapshot",
    });
    expect(resolution.plain).toBe("");
    expect(resolution.fallbackReason).toBe("awaiting_server_display_authority");
    expect(resolution.plain).not.toContain("TAMPERED_LOCAL_COMPLETION_SNAP");
    expect(hasVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBe(false);
  });

  it("local SoT / accepted-corpus data cannot paint review corpus before GET", () => {
    establishPaidProSourceOfTruth({
      text: SOT_LOCAL,
      source: "server_full_draft",
    });
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
    });
    expect(resolution.plain).toBe("");
    expect(resolution.fallbackReason).toBe("awaiting_server_display_authority");
    expect(resolution.plain).not.toContain("LOCAL_SOT_MUST_NOT_PAINT");
    const branch = resolvePaidProVisibleShellRenderBranch({
      hasSoT: true,
      sotLen: SOT_LOCAL.length,
      htmlLen: 0,
      canonicalPlainLen: resolution.plain.length,
      paidProFirstReviewActive: true,
    });
    expect(branch.branch).toBe("empty");
    expect(branch.reason).toBe("paid_pro_awaiting_display_authority");
  });

  it("checkout-return and entitlement-rewrite stay locked until verified GET", async () => {
    establishPaidProSourceOfTruth({ text: SOT_LOCAL, source: "server_full_draft" });
    storeDisplayReviewSnapshotAuthority({
      agreementId: AGREEMENT_ID,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: "a".repeat(64),
      corpusLength: SOT_LOCAL.length,
      status: "pending",
    });
    // Metadata alone (no GET corpus bytes) must not unlock chrome / Prepare / paint.
    expect(hasPaidProChromeAuthority({ agreementId: AGREEMENT_ID })).toBe(false);
    expect(canEnableCommercialPrepareFromServerSnapshot(AGREEMENT_ID)).toBe(false);
    expect(
      resolvePaidProFirstReviewVisibleDisplayPlain({
        agreementId: AGREEMENT_ID,
        premiumCheckoutCompleted: true,
        paidProActive: true,
      }).plain,
    ).toBe("");

    await seedVerifiedServerCorpus({ status: "pending" });
    expect(hasPaidProChromeAuthority({ agreementId: AGREEMENT_ID })).toBe(true);
    expect(canEnableCommercialPrepareFromServerSnapshot(AGREEMENT_ID)).toBe(false);
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      paidProActive: true,
    });
    expect(painted.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    expect(painted.plain).toContain("SERVER_GET_AUTHORITY_MARKER");
    expect(painted.source).toBe("verified_server_canonical_review_snapshot");
  });

  it("empty agreement ID blocks review-ready / Prepare state", async () => {
    await seedVerifiedServerCorpus();
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "",
      premiumCheckoutCompleted: true,
      paidProActive: true,
    });
    expect(resolution.plain).toBe("");
    expect(resolution.fallbackReason).toBe("missing_agreement_id");
    expect(canEnableCommercialPrepareFromServerSnapshot("")).toBe(false);
    expect(canEnableCommercialPrepareFromServerSnapshot(null)).toBe(false);
    expect(hasPaidProChromeAuthority({ agreementId: "" })).toBe(false);
  });

  it("GET mismatch / failure leaves no legal corpus visible and blocks Prepare/dispatch", async () => {
    // Stale display metadata that does not match stored corpus bytes.
    storeDisplayReviewSnapshotAuthority({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_mismatch",
      corpusSha256: "b".repeat(64),
      corpusLength: 9999,
      status: "pending",
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: await sha256CorpusDigest(SERVER_CORPUS),
      corpusLength: SERVER_CORPUS.length,
      status: "pending",
      corpusPlain: SERVER_CORPUS,
    });
    // Overwrite display meta to diverge from corpus (mismatch).
    storeDisplayReviewSnapshotAuthority({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_mismatch",
      corpusSha256: "c".repeat(64),
      corpusLength: 42,
      status: "pending",
    });
    expect(readVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBeNull();
    expect(hasVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBe(false);
    const resolution = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      paidProActive: true,
    });
    expect(resolution.plain).toBe("");
    expect(canEnableCommercialPrepareFromServerSnapshot(AGREEMENT_ID)).toBe(false);
    expect(hasPaidProChromeAuthority({ agreementId: AGREEMENT_ID })).toBe(false);
  });

  it("verified server snapshot renders expected corpus and unlocks normal accept→Prepare path", async () => {
    await seedVerifiedServerCorpus({ status: "pending" });
    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
      pickerPlain: TAMPERED_LOCAL,
      pickerSource: "live_generated_preview",
    });
    expect(painted.plain).toContain("SERVER_GET_AUTHORITY_MARKER");
    expect(painted.plain).not.toContain("TAMPERED_LOCAL_COMPLETION_SNAP");
    expect(painted.source).toBe("verified_server_canonical_review_snapshot");
    expect(hasPaidProChromeAuthority({ agreementId: AGREEMENT_ID })).toBe(true);
    expect(canEnableCommercialPrepareFromServerSnapshot(AGREEMENT_ID)).toBe(false);

    const sha = await sha256CorpusDigest(SERVER_CORPUS);
    storeAcceptedReviewSnapshotRef({
      agreementId: AGREEMENT_ID,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: sha,
      corpusLength: SERVER_CORPUS.length,
    });
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: SNAPSHOT_ID,
      corpusSha256: sha,
      corpusLength: SERVER_CORPUS.length,
      status: "accepted",
      corpusPlain: SERVER_CORPUS,
    });
    expect(canEnableCommercialPrepareFromServerSnapshot(AGREEMENT_ID)).toBe(true);
  });

  it("adversarial: completed hydrate + matching verified GET corpus must paint (blank surface fails)", async () => {
    // SoT rematerialized (hydrate-complete style) while paint still requires verified GET + agreementId.
    establishPaidProSourceOfTruth({
      text: SERVER_CORPUS,
      source: "server_full_draft",
    });
    await seedVerifiedServerCorpus({ status: "pending", corpus: SERVER_CORPUS });
    expect(hasVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBe(true);
    expect(hashPaidProCorpus(SERVER_CORPUS).length).toBeGreaterThan(8);

    const stuckWithoutAgreementId = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: "",
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
    });
    expect(stuckWithoutAgreementId.plain).toBe("");
    expect(stuckWithoutAgreementId.fallbackReason).toBe("missing_agreement_id");
    expect(
      resolvePaidProVisibleShellRenderBranch({
        hasSoT: true,
        sotLen: SERVER_CORPUS.length,
        htmlLen: 0,
        canonicalPlainLen: stuckWithoutAgreementId.plain.length,
        paidProFirstReviewActive: true,
      }).branch,
    ).toBe("empty");

    const painted = resolvePaidProFirstReviewVisibleDisplayPlain({
      agreementId: AGREEMENT_ID,
      premiumCheckoutCompleted: true,
      premiumPaidDocumentSurface: true,
      paidProActive: true,
    });
    expect(painted.plain.length).toBeGreaterThanOrEqual(PAID_PRO_VISIBLE_SHELL_SOT_MIN_LEN);
    expect(painted.plain).toBe(SERVER_CORPUS.trim());
    expect(painted.source).toBe("verified_server_canonical_review_snapshot");
    const branch = resolvePaidProVisibleShellRenderBranch({
      hasSoT: true,
      sotLen: SERVER_CORPUS.length,
      htmlLen: 0,
      canonicalPlainLen: painted.plain.length,
      canonicalPlainSource: painted.source,
      paidProFirstReviewActive: true,
    });
    expect(branch.branch).toBe("canonical_plain_forced");
    // Blank surface with healthy SoT+verified GET is the J4 failure mode — this must not regress.
    expect(painted.plain.length).toBeGreaterThan(0);
    expect(painted.plain).toContain("SERVER_GET_AUTHORITY_MARKER");
  });
});

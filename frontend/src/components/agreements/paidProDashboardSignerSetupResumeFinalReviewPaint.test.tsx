/** @vitest-environment jsdom */
/**
 * Dashboard signer-setup resume → Continue to signature links must paint the finalized
 * signer-hydrated corpus (names/titles/emails), not blank Name/Title lines from a longer
 * pre-signer SoT, even when GET /canonical-review-snapshot 404s.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  hasVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { buildHydratedAuthoritativeSigningCorpus } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  hasAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import { resolveCanonicalFinalPartyManifest } from "./guidedDealCompletion/canonicalFinalPartyManifest";
import { resolveCanonicalPartyIdentitiesFromSignerSetup } from "./guidedDealCompletion/signerPartyIdentity";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import {
  PaidProDocumentBodyForcedRoute,
  resolvePaidProDocumentBodyRouter,
  resetPaidProDocumentBodyRouterLogsForTests,
} from "./paidProDocumentBodyRouter";
import { resolvePaidProPostFinalizeReviewPlain } from "./paidProPostFinalizeReviewSurface";
import { isPaidProPostFinalizeHydratedCorpusLocked } from "./paidProSignerMetadataCommitPolicy";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resetPaidProVisibleDocumentShellLogsForTests } from "./paidProVisibleDocumentShell";
import {
  clearFrozenSigningAuthoritySnapshotForSession,
  readFrozenSigningAuthoritySnapshot,
} from "./frozenSigningAuthoritySnapshot";
import {
  clearPaidProReviewSessionAuthorityForTests,
  establishPaidProReviewSessionAuthority,
  readPaidProReviewSessionAuthority,
  replacePaidProReviewSessionAuthorityAfterSignerFinalize,
} from "./paidProReviewSessionAuthority";
import {
  fingerprintPaidReviewSessionCorpusBody,
  latchPaidReviewSessionCanonicalSoTHash,
  readPaidReviewSessionCorpusInvariant,
  resetPaidReviewSessionCorpusInvariantForTests,
} from "./paidProReviewSessionCorpusInvariantState";

const here = dirname(fileURLToPath(import.meta.url));
const intakeSrc = readFileSync(join(here, "AgreementBuilderIntake.tsx"), "utf8");
const snapSrc = readFileSync(join(here, "authoritativeSigningSnapshot.ts"), "utf8");

const AGREEMENT_ID = "9d6d1be0-55dd-415a-bf61-fee9db743674";
const ACME = "Acme Test Co";
const LAWDOG = "LawDog Demo LLC";

function buildPreSignerSoT(targetLen = 9705): string {
  const head = [
    "SERVICES AGREEMENT",
    "",
    `This Agreement is between ${ACME} and ${LAWDOG}.`,
    "",
    ...Array.from({ length: 80 }, (_, i) => `Section ${i + 1}. Operative clause for staging resume.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    ACME,
    "By: _________________________________",
    "Name:",
    "Title:",
    "Date:",
    "",
    "SERVICE PROVIDER:",
    LAWDOG,
    "By: _________________________________",
    "Name:",
    "Title:",
    "Date:",
  ].join("\n");
  return head.padEnd(targetLen, " ");
}

function finalizeTwoSigners(rawCorpus: string) {
  const signerArgs = {
    partyCount: 2,
    partySignerNames: ["Alice Resume", "Bob Resume"],
    partySignerTitles: ["CEO", "General Counsel"],
    recipient1Name: ACME,
    recipient2Name: LAWDOG,
    recipient1Email: "alice@acme.test",
    recipient2Email: "bob@lawdog.test",
    extraPartyReviewEmails: [] as string[],
    draftPartyNames: [ACME, LAWDOG],
    sendMode: "signature" as const,
    recipientsDeferred: false,
  };
  const manifest = resolveCanonicalFinalPartyManifest(signerArgs);
  const identities = resolveCanonicalPartyIdentitiesFromSignerSetup(signerArgs);
  const hydrated = buildHydratedAuthoritativeSigningCorpus({
    rawCorpus,
    identities,
    intakeRaw: `${ACME} and ${LAWDOG}`,
    surface: "dashboard_signer_setup_resume_finalize",
  });
  expect(hydrated.rejected).toBe(false);
  const snap = createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: {
      partySignerNames: ["Alice Resume", "Bob Resume"],
      partySignerTitles: ["CEO", "General Counsel"],
      partyAddresses: ["1 Acme Way", "2 LawDog Lane"],
      recipient1Name: ACME,
      recipient2Name: LAWDOG,
      recipient1Email: "alice@acme.test",
      recipient2Email: "bob@lawdog.test",
      extraPartyReviewEmails: [],
    },
    partyManifest: manifest,
    signatureBlockModel: { signFirst: true, entries: [] },
    replaceExisting: true,
    agreementId: AGREEMENT_ID,
  });
  setPaidProPinnedSignerAppliedCorpus(snap.corpus);
  return snap;
}

describe("dashboard signer-setup resume → Continue paints finalized signer corpus", () => {
  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    clearAuthoritativeSigningSnapshot();
    clearPaidProPinnedSignerAppliedCorpus();
    clearPaidProSourceOfTruth();
    clearAcceptedReviewSnapshotRef();
    clearDisplayReviewSnapshotAuthority();
    clearFrozenSigningAuthoritySnapshotForSession();
    clearPaidProReviewSessionAuthorityForTests();
    resetPaidReviewSessionCorpusInvariantForTests();
    resetPaidProVisibleDocumentShellLogsForTests();
    resetPaidProDocumentBodyRouterLogsForTests();
    vi.restoreAllMocks();
  });

  it("intake prefers post-finalize paint before verified GET gate and blocks on persist failure", () => {
    const commercialBlock = intakeSrc.indexOf("if (commercialDisplayLocked)");
    const postFinalizeIdx = intakeSrc.indexOf(
      "if (isPaidProPostFinalizeHydratedCorpusLocked())",
      commercialBlock,
    );
    const verifiedGateIdx = intakeSrc.indexOf(
      "if (!hasVerifiedCommercialDisplayCorpus(agreementIdForDisplay)) return \"\";",
      commercialBlock,
    );
    expect(commercialBlock).toBeGreaterThan(0);
    expect(postFinalizeIdx).toBeGreaterThan(commercialBlock);
    expect(verifiedGateIdx).toBeGreaterThan(postFinalizeIdx);
    expect(intakeSrc).toContain("prepareCommercialReviewSnapshotAuthority({");
    expect(intakeSrc).toContain("persistFrozenSigningAuthorityToBackendDetailed");
    expect(intakeSrc).toContain("replacePaidProReviewSessionAuthorityAfterSignerFinalize");
    expect(intakeSrc).toContain("Could not persist the finalized agreement snapshot");
    expect(intakeSrc).toContain("Could not persist frozen signing authority");
    expect(intakeSrc).toContain("persistFrozenToBackend: false");
    expect(intakeSrc).toContain("agreementId: durableAgreementId");
    expect(snapSrc).toContain("args.agreementId");
  });

  it("finalized snapshot paints signer names/titles/emails when GET corpus is absent", () => {
    const sot = buildPreSignerSoT(9705);
    establishPaidProSourceOfTruth({ text: sot, source: "server_full_draft" });
    const establishedSoT = getPaidProSourceOfTruthText();
    expect(establishedSoT.length).toBeGreaterThan(2000);
    expect(establishedSoT).toMatch(/Name:\s*$/m);

    const snap = finalizeTwoSigners(establishedSoT);
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(true);
    expect(hasVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBe(false);

    const reviewPlain = resolvePaidProPostFinalizeReviewPlain();
    expect(reviewPlain.length).toBeGreaterThan(0);
    // Staging smoke: finalized signer corpus (~9637) diverges from pre-signer SoT (~9705).
    expect(reviewPlain.length).not.toBe(establishedSoT.length);
    expect(hashPaidProCorpus(reviewPlain)).toBe(snap.hash);
    expect(reviewPlain).toMatch(/Name:\s*Alice Resume/i);
    expect(reviewPlain).toMatch(/Title:\s*CEO/i);
    expect(reviewPlain).toMatch(/Name:\s*Bob Resume/i);
    expect(reviewPlain).toMatch(/Title:\s*General Counsel/i);
    expect(reviewPlain).toMatch(/alice@acme\.test/i);
    expect(reviewPlain).toMatch(/bob@lawdog\.test/i);
    expect(reviewPlain).not.toMatch(/^Name:\s*$/m);
    expect(reviewPlain).not.toMatch(/Authorized Signer/i);

    const frozen = readFrozenSigningAuthoritySnapshot();
    expect(frozen?.agreementId).toBe(AGREEMENT_ID);
  });

  it("ForcedRoute prefers finalized signer corpus over longer blank SoT", () => {
    const sot = buildPreSignerSoT(9705);
    establishPaidProSourceOfTruth({ text: sot, source: "server_full_draft" });
    const snap = finalizeTwoSigners(getPaidProSourceOfTruthText());

    const router = resolvePaidProDocumentBodyRouter();
    const { container, unmount } = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={router}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
        }}
      />,
    );
    const text = container.textContent || "";
    expect(text).toMatch(/Alice Resume/);
    expect(text).toMatch(/Bob Resume/);
    expect(text).toMatch(/alice@acme\.test/i);
    expect(text).not.toMatch(/^Name:\s*$/m);
    // Shell must not paint the longer blank SoT preferentially.
    expect(text.includes("Alice Resume")).toBe(true);
    expect(snap.corpus).toContain("Alice Resume");
    unmount();
  });

  it("advances review-session authority from pre-signer SoT to finalized signer corpus", () => {
    const sot = buildPreSignerSoT(9705);
    establishPaidProSourceOfTruth({ text: sot, source: "server_full_draft" });
    const establishedSoT = getPaidProSourceOfTruthText();
    establishPaidProReviewSessionAuthority({
      corpusPlain: establishedSoT,
      source: "server_full_draft",
      agreementId: AGREEMENT_ID,
      reviewSessionId: AGREEMENT_ID,
    });
    latchPaidReviewSessionCanonicalSoTHash({
      reviewSessionId: AGREEMENT_ID,
      canonicalPlain: establishedSoT,
    });
    const priorHash = readPaidProReviewSessionAuthority()?.hash ?? "";
    expect(priorHash.length).toBeGreaterThan(0);

    const snap = finalizeTwoSigners(establishedSoT);
    replacePaidProReviewSessionAuthorityAfterSignerFinalize({
      corpusPlain: snap.corpus,
      agreementId: AGREEMENT_ID,
      reviewSessionId: AGREEMENT_ID,
    });
    const next = readPaidProReviewSessionAuthority();
    expect(next?.hash).toBe(snap.hash);
    expect(next?.hash).not.toBe(priorHash);
    expect(next?.source).toBe("paid_pro_signer_metadata_finalize");
    expect(next?.corpusPlain).toMatch(/Alice Resume/);
    expect(next?.corpusPlain).not.toMatch(/^Name:\s*$/m);
    const invariant = readPaidReviewSessionCorpusInvariant(AGREEMENT_ID);
    expect(invariant?.latchedCanonicalSoTHash).toBe(
      fingerprintPaidReviewSessionCorpusBody(snap.corpus),
    );
    expect(invariant?.latchedReviewDisplayHash).toBeNull();
  });
});

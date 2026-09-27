/** @vitest-environment jsdom */
/**
 * Dashboard signer-setup resume paints only a verified owner-scoped GET corpus.
 * Local/module finalized bytes cannot authorize resume paper.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { render } from "@testing-library/react";
import {
  clearAcceptedReviewSnapshotRef,
  clearDisplayReviewSnapshotAuthority,
  hasVerifiedCommercialDisplayCorpus,
  sha256CorpusDigest,
  storeVerifiedCommercialDisplayCorpus,
} from "../../agreement/canonicalReviewSnapshotApi";
import { armCreatorDashboardSignerSetupResume } from "../../launch/creatorDashboardReviewLinkRouting";
import {
  selectDashboardResumePaint,
} from "./paidProDashboardResumeAuthoritySelection";
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

function buildPreSignerSoT(targetLen = 10_464): string {
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
  if (head.length >= targetLen) return head;
  let body = head;
  let i = 81;
  while (body.length < targetLen) {
    body += `\nSection ${i}. Operative clause for staging resume.`;
    i += 1;
  }
  return body.slice(0, targetLen);
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

  it("resume paint requires verified GET; persist failure stays a paid retry", () => {
    expect(intakeSrc).toContain("hasVerifiedCommercialDisplayCorpus");
    expect(intakeSrc).toContain("prepareCommercialReviewSnapshotAuthority({");
    expect(intakeSrc).toContain("paintedPersistPlain: readPaintedSequentialPersistReviewPlain()");
    expect(intakeSrc).toContain("persistFrozenSigningAuthorityToBackendDetailed");
    expect(intakeSrc).toContain("Could not persist the finalized agreement snapshot");
    expect(intakeSrc).toContain("Could not persist frozen signing authority");
    expect(intakeSrc).toContain("persistFrozenToBackend: false");
    expect(intakeSrc).toContain("agreementId: durableAgreementId");
    expect(snapSrc).toContain("args.agreementId");
    expect(intakeSrc).toContain("hasVerifiedCommercialDisplayCorpus(");
  });

  it("local finalized corpus without verified GET does not authorize dashboard resume paper", () => {
    const sot = buildPreSignerSoT();
    establishPaidProSourceOfTruth({ text: sot, source: "server_full_draft" });
    const snap = finalizeTwoSigners(getPaidProSourceOfTruthText());
    expect(hasAuthoritativeSigningSnapshot()).toBe(true);
    expect(isPaidProPostFinalizeHydratedCorpusLocked()).toBe(true);
    expect(hasVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBe(false);
    expect(snap.corpus).toMatch(/Alice Resume/i);
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const resume = selectDashboardResumePaint({
      agreementId: AGREEMENT_ID,
      resumeActive: true,
      authenticatedOwner: true,
    });
    expect(resume.kind).toBe("paid_retry");
    expect(resume.canPaintReview).toBe(false);
    expect(resume.plain).toBe("");
    const frozen = readFrozenSigningAuthoritySnapshot();
    expect(frozen?.agreementId).toBe(AGREEMENT_ID);
  });

  it("verified GET resume paints the frozen body and server signer metadata", async () => {
    const sot = buildPreSignerSoT();
    establishPaidProSourceOfTruth({ text: sot, source: "server_full_draft" });
    const snap = finalizeTwoSigners(getPaidProSourceOfTruthText());
    const sha = await sha256CorpusDigest(snap.corpus);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_resume_final",
      corpusSha256: sha,
      corpusLength: snap.corpus.length,
      status: "accepted",
      corpusPlain: snap.corpus,
    });
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const resume = selectDashboardResumePaint({
      agreementId: AGREEMENT_ID,
      resumeActive: true,
      authenticatedOwner: true,
    });
    expect(resume.canPaintReview).toBe(true);
    expect(resume.agreementId).toBe(AGREEMENT_ID);
    expect(resume.plain).toMatch(/Name:\s*Alice Resume/i);
    expect(resume.plain).toMatch(/Title:\s*CEO/i);
    expect(resume.plain).toMatch(/Name:\s*Bob Resume/i);
    expect(resume.plain).toMatch(/alice@acme\.test/i);
    expect(hashPaidProCorpus(resume.plain)).toBe(snap.hash);
    expect(resume.plain).not.toMatch(/Authorized Signer/i);
  });

  it("ForcedRoute resume stays empty until verified GET, then paints signer metadata", async () => {
    const sot = buildPreSignerSoT();
    establishPaidProSourceOfTruth({ text: sot, source: "server_full_draft" });
    const snap = finalizeTwoSigners(getPaidProSourceOfTruthText());
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const routerEmpty = resolvePaidProDocumentBodyRouter();
    const first = render(
      <PaidProDocumentBodyForcedRoute
        embedded
        router={routerEmpty}
        html=""
        displayContext={{
          paidProActive: true,
          premiumPaidDocumentSurface: true,
          premiumCheckoutCompleted: true,
          agreementId: AGREEMENT_ID,
        }}
      />,
    );
    expect(first.container.textContent || "").not.toMatch(/Alice Resume/);
    first.unmount();

    const sha = await sha256CorpusDigest(snap.corpus);
    storeVerifiedCommercialDisplayCorpus({
      agreementId: AGREEMENT_ID,
      snapshotId: "crs_resume_forced",
      corpusSha256: sha,
      corpusLength: snap.corpus.length,
      status: "accepted",
      corpusPlain: snap.corpus,
    });
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
          agreementId: AGREEMENT_ID,
        }}
      />,
    );
    const text = container.textContent || "";
    expect(text).toMatch(/Alice Resume/);
    expect(text).toMatch(/Bob Resume/);
    expect(text).toMatch(/alice@acme\.test/i);
    unmount();
  });

  it("review-session / pipeline corpus without verified GET cannot authorize dashboard resume", () => {
    const sot = buildPreSignerSoT();
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
    expect(readPaidProReviewSessionAuthority()?.hash).toBe(snap.hash);
    expect(hasVerifiedCommercialDisplayCorpus(AGREEMENT_ID)).toBe(false);
    armCreatorDashboardSignerSetupResume(AGREEMENT_ID);
    const resume = selectDashboardResumePaint({
      agreementId: AGREEMENT_ID,
      resumeActive: true,
      authenticatedOwner: true,
    });
    expect(resume.kind).toBe("paid_retry");
    expect(resume.canPaintReview).toBe(false);
  });
});

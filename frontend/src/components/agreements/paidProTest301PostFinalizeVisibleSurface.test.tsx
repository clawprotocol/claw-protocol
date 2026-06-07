/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
} from "./authoritativeSigningSnapshot";
import {
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
  buildCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
import { countBlankSignerMetadataLinesInExecutionBlock } from "./hydratePaidProExecutionBlockWithSignerMetadata";
import {
  countVisibleBlankSignerPlaceholderLines,
} from "./paidProPostFinalizeReviewSurface";
import { buildCanonicalSignerManifest } from "./guidedDealCompletion/guidedReviewSigningContinuity";
import {
  authorityPartiesToCanonicalPartyIdentities,
  authorityPartiesToRecipientMetadata,
  buildCanonicalFinalPartyManifestFromAuthority,
  buildLivePaidProSignerMetadataAuthority,
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { PaidProForcedFirstReviewChrome } from "./paidProForcedFirstReviewChrome";
import {
  auditPaidProPostFinalizeVisibleSurface,
  resolvePaidProPostFinalizeReviewHash,
  resolvePaidProPostFinalizeReviewPlain,
} from "./paidProPostFinalizeReviewSurface";
import {
  PaidProVisibleDocumentShell,
  resetPaidProVisibleDocumentShellLogsForTests,
  resolveCanonicalPlainForVisibleShell,
  resolvePaidProVisibleShellRenderBranch,
} from "./paidProVisibleDocumentShell";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

const FREEZE_BODY = [
  "CONSULTING AND IMPLEMENTATION AGREEMENT",
  "",
  `This Agreement is between ${BLUE} ("Client") and ${IRON} ("Service Provider").`,
  "",
  ...Array.from({ length: 28 }, (_, i) => `Section ${i + 1}. Operative clause ${i + 1}.`),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  `PARTY: ${BLUE}`,
  "By: _________________________________",
  "Name: ________________________________",
  "Title: ________________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: _____________________________",
  "",
  `PARTY: ${IRON}`,
  "By: _________________________________",
  "Name: ________________________________",
  "Title: ________________________________",
  "Email for Notice: __________________________",
  "Address for Notice: ________________________",
  "Date: _____________________________",
].join("\n");

function qaAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: BLUE,
    recipient2Name: IRON,
    recipient1Email: "sm45@gmail.com",
    recipient2Email: "fnj34@gmail.com",
    extraPartyReviewEmails: [],
    partySignerNames: ["Sarah Mitchell", "Michael Torres"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      "1027 S. Rainbow Blvd., #124, Las Vegas, NV 89354",
      "23 Second Ave, Tuet, NM 89745",
    ],
  });
}

function armFinalizeSnapshot() {
  establishPaidProSourceOfTruth({
    text: FREEZE_BODY,
    source: "server_full_draft",
    intakeText: "consulting between Blue Canyon and Iron Vale",
  });
  const snap = buildCanonicalAgreementSnapshot({
    surface: "test301",
    tier: "pro",
    candidates: [{ source: "server_full_document_text", text: FREEZE_BODY }],
    parties: [
      { name: BLUE, role: "Client" },
      { name: IRON, role: "Service Provider" },
    ],
    minLen: 500,
  });
  freezeCanonicalAgreementSnapshot(snap, "server_full_document_text");
  const authority = qaAuthority();
  setConsumedPaidProSignerMetadataAuthority(authority);
  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: FREEZE_BODY,
    authority,
    intakeRaw: "",
    surface: "finalize_paid_pro_signer_metadata",
    signatureRegionOnly: true,
    repairRecital: false,
  });
  const identities = authorityPartiesToCanonicalPartyIdentities(authority.parties);
  createAuthoritativeSigningSnapshot({
    corpus: hydrated.corpus,
    signerMetadata: authorityPartiesToRecipientMetadata(authority.parties),
    partyManifest: buildCanonicalFinalPartyManifestFromAuthority(authority),
    signatureBlockModel: buildCanonicalSignerManifest({ identities, signFirst: true }),
  });
  setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
  return hydrated.corpus;
}

describe("Test301 post-finalize visible surface uses hydrated snapshot", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
    vi.stubGlobal("navigator", {
      clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  afterEach(() => {
    resetPaidProVisibleDocumentShellLogsForTests();
    cleanup();
    vi.unstubAllGlobals();
  });

  it("resolveCanonicalPlainForVisibleShell prefers locked snapshot over canonical SoT", () => {
    armFinalizeSnapshot();
    const resolved = resolveCanonicalPlainForVisibleShell();
    expect(resolved.source).toBe("authoritative_signing_snapshot");
    expect(resolved.plain).toMatch(/Sarah Mitchell/i);
    expect(resolved.plain).toMatch(/Michael Torres/i);
    expect(countBlankSignerMetadataLinesInExecutionBlock(resolved.plain)).toBe(0);
    expect(hashPaidProCorpus(resolved.plain)).toBe(resolvePaidProPostFinalizeReviewHash());
  });

  it("visible document shell renders hydrated signer metadata in DOM", () => {
    armFinalizeSnapshot();
    const branch = resolvePaidProVisibleShellRenderBranch({
      hasSoT: true,
      sotLen: FREEZE_BODY.length,
      htmlLen: 0,
      canonicalPlainLen: resolveCanonicalPlainForVisibleShell().plain.length,
      canonicalPlainSource: "authoritative_signing_snapshot",
    });
    expect(branch.reason).toBe("post_finalize_hydrated_snapshot_plain");
    render(<PaidProVisibleDocumentShell html="" compactDocumentTopPadding />);
    const shell = screen.getByTestId("paid-pro-visible-document-shell");
    const text = shell.textContent || "";
    expect(text).toMatch(/Sarah Mitchell/i);
    expect(text).toMatch(/CEO/i);
    expect(text).toMatch(/sm45@gmail\.com/i);
    expect(text).toMatch(/1027 S\. Rainbow Blvd/i);
    expect(text).toMatch(/Michael Torres/i);
    expect(text).toMatch(/President/i);
    expect(text).toMatch(/fnj34@gmail\.com/i);
    expect(text).toMatch(/23 Second Ave/i);
    expect(countVisibleBlankSignerPlaceholderLines(text)).toBe(0);
    const audit = auditPaidProPostFinalizeVisibleSurface({
      visibleText: text,
      expectedPlain: resolvePaidProPostFinalizeReviewPlain(),
      signerNames: ["Sarah Mitchell", "Michael Torres"],
    });
    expect(audit.mismatch).toBe(false);
  });

  it("copy/export/edit/review surfaces share hydrated hash after finalize", () => {
    armFinalizeSnapshot();
    const lockedHash = resolvePaidProPostFinalizeReviewHash();
    expect(hashPaidProCorpus(getPaidProDocumentForSurface("copy")?.text ?? "")).toBe(lockedHash);
    expect(hashPaidProCorpus(getPaidProDocumentForSurface("review")?.text ?? "")).toBe(lockedHash);
    expect(hashPaidProCorpus(getPaidProDocumentForSurface("finalized")?.text ?? "")).toBe(lockedHash);
  });

  it("forced review chrome enables all five action buttons after finalize", () => {
    const onPrepare = vi.fn();
    const onShare = vi.fn();
    const onEdit = vi.fn();
    const onExport = vi.fn();
    armFinalizeSnapshot();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        postFinalizeCorpusHash={resolvePaidProPostFinalizeReviewHash()}
        postFinalizeActionsReady
        getCopyPlainText={() => resolvePaidProPostFinalizeReviewPlain()}
        onPrepareSignatures={onPrepare}
        onShareForReview={onShare}
        onEditAgreement={onEdit}
        onExportAgreement={onExport}
      />,
    );
    const actions = screen.getByTestId("paid-pro-forced-first-review-actions");
    const prepare = within(actions).getByTestId("paid-pro-forced-prepare-signatures");
    const share = within(actions).getByTestId("paid-pro-forced-share-for-review");
    const copy = within(actions).getByTestId("paid-pro-forced-copy-agreement");
    const exportBtn = within(actions).getByTestId("paid-pro-forced-export-agreement");
    const edit = within(actions).getByTestId("paid-pro-forced-edit-agreement");
    expect((prepare as HTMLButtonElement).disabled).toBe(false);
    expect((share as HTMLButtonElement).disabled).toBe(false);
    expect((copy as HTMLButtonElement).disabled).toBe(false);
    expect((exportBtn as HTMLButtonElement).disabled).toBe(false);
    expect((edit as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(prepare);
    fireEvent.click(share);
    fireEvent.click(copy);
    fireEvent.click(exportBtn);
    fireEvent.click(edit);
    expect(onPrepare).toHaveBeenCalledTimes(1);
    expect(onShare).toHaveBeenCalledTimes(1);
    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("paidProVisibleDocumentShell and intake wire post-finalize snapshot source", () => {
    const shellSrc = readFileSync(join(__dirname, "paidProVisibleDocumentShell.tsx"), "utf8");
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(shellSrc).toContain("authoritative_signing_snapshot");
    expect(shellSrc).toContain("resolvePaidProPostFinalizeReviewPlain");
    expect(readFileSync(join(__dirname, "paidProPostFinalizeReviewSurface.ts"), "utf8")).toContain(
      "[paid-pro-post-finalize-visible-surface-mismatch]",
    );
    expect(intakeSrc).toContain("paidProPostFinalizeActionsReady");
    expect(intakeSrc).toContain("postFinalizeCorpusHash");
    expect(readFileSync(join(__dirname, "paidProForcedFirstReviewChrome.tsx"), "utf8")).toContain(
      "logPaidProPostFinalizeActionClick",
    );
  });
});

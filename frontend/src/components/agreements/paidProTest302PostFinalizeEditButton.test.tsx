/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import {
  clearAuthoritativeSigningSnapshot,
  createAuthoritativeSigningSnapshot,
  readAuthoritativeSigningCorpus,
} from "./authoritativeSigningSnapshot";
import {
  buildCanonicalAgreementSnapshot,
  clearFrozenCanonicalAgreementCorpus,
  freezeCanonicalAgreementSnapshot,
} from "./canonicalAgreementSnapshot";
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
import { PaidProPostFinalizeAgreementEditor } from "./paidProPostFinalizeAgreementEditor";
import {
  tryResolvePaidProPostFinalizeEditOpen,
} from "./paidProPostFinalizeEditAgreement";
import { resolvePaidProPostFinalizeReviewHash } from "./paidProPostFinalizeReviewSurface";
import {
  clearPaidProPinnedSignerAppliedCorpus,
  setPaidProPinnedSignerAppliedCorpus,
} from "./paidProFinalHydratedCorpus";
import { clearPaidProSourceOfTruth, establishPaidProSourceOfTruth } from "./paidProSourceOfTruth";

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
  "Date: _____________________________",
  "",
  `PARTY: ${IRON}`,
  "By: _________________________________",
  "Name: ________________________________",
  "Title: ________________________________",
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
    surface: "test302",
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

describe("Test302 post-finalize edit agreement text opens hydrated editor", () => {
  beforeEach(() => {
    clearPaidProSourceOfTruth();
    clearAuthoritativeSigningSnapshot();
    clearFrozenCanonicalAgreementCorpus();
    clearConsumedPaidProSignerMetadataAuthority();
    clearPaidProPinnedSignerAppliedCorpus();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("tryResolvePaidProPostFinalizeEditOpen returns hydrated Sarah Mitchell / Michael Torres corpus", () => {
    armFinalizeSnapshot();
    const result = tryResolvePaidProPostFinalizeEditOpen({
      hasDraft: true,
      signersComplete: true,
    });
    expect(result.opened).toBe(true);
    if (!result.opened) return;
    expect(result.hydrated).toBe(true);
    expect(result.source).toBe("authoritative_signing_snapshot");
    expect(result.plain).toMatch(/Sarah Mitchell/i);
    expect(result.plain).toMatch(/Michael Torres/i);
    expect(result.plain).toMatch(/sm45@gmail\.com/i);
    expect(result.plain).toMatch(/fnj34@gmail\.com/i);
    expect(result.corpusHash).toBe(resolvePaidProPostFinalizeReviewHash());
    expect(readAuthoritativeSigningCorpus()).toBe(result.plain);
  });

  it("blocks edit open when draft missing on post-finalize lock", () => {
    armFinalizeSnapshot();
    const result = tryResolvePaidProPostFinalizeEditOpen({
      hasDraft: false,
      signersComplete: true,
    });
    expect(result.opened).toBe(false);
    if (result.opened) return;
    expect(result.reason).toBe("no_draft");
    expect(result.hydrated).toBe(true);
  });

  it("PaidProPostFinalizeAgreementEditor mounts textarea with hydrated value", () => {
    const corpus = armFinalizeSnapshot();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    render(
      <PaidProPostFinalizeAgreementEditor
        value={corpus}
        onChange={() => {}}
        onSave={onSave}
        onCancel={onCancel}
      />,
    );
    const editor = screen.getByTestId("paid-pro-post-finalize-agreement-editor");
    const textarea = within(editor).getByTestId("paid-pro-post-finalize-edit-textarea") as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/Sarah Mitchell/i);
    expect(textarea.value).toMatch(/Michael Torres/i);
    fireEvent.click(within(editor).getByTestId("paid-pro-post-finalize-edit-save"));
    fireEvent.click(within(editor).getByTestId("paid-pro-post-finalize-edit-cancel"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it("forced review chrome edit button calls opener once", () => {
    const onEdit = vi.fn();
    armFinalizeSnapshot();
    render(
      <PaidProForcedFirstReviewChrome
        signersReady
        signerMetadataFinalized
        postFinalizeCorpusHash={resolvePaidProPostFinalizeReviewHash()}
        postFinalizeActionsReady
        getCopyPlainText={() => readAuthoritativeSigningCorpus()}
        onEditAgreement={onEdit}
        onExportAgreement={() => {}}
        onShareForReview={() => {}}
        onPrepareSignatures={() => {}}
      />,
    );
    const edit = screen.getByTestId("paid-pro-forced-edit-agreement");
    fireEvent.click(edit);
    expect(onEdit).toHaveBeenCalledTimes(1);
  });

  it("intake forced route renders post-finalize editor when premiumReviewDocEditorOpen", () => {
    const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    expect(intakeSrc).toContain("PaidProPostFinalizeAgreementEditor");
    expect(intakeSrc).toContain("premiumReviewDocEditorOpen ? (");
    expect(intakeSrc).toContain("tryResolvePaidProPostFinalizeEditOpen");
    expect(readFileSync(join(__dirname, "paidProPostFinalizeEditAgreement.ts"), "utf8")).toContain(
      "[paid-pro-post-finalize-edit-opened]",
    );
    expect(readFileSync(join(__dirname, "paidProPostFinalizeEditAgreement.ts"), "utf8")).toContain(
      "[paid-pro-post-finalize-edit-blocked]",
    );
    expect(intakeSrc).toContain("onEditAgreement={() => void openPaidProDraftCardEditor()}");
  });
});

/**
 * TEST428 — Genesis Dog UX/UI regression assertions on TEST427 workflow state.
 */

import type { WorkspaceIndexAgreement } from "../../agreement/agreementWorkspaceApi";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { isAgreementCompletedForDashboard } from "../../launch/creatorDashboardAgreementCompletion";
import { resolveCreatorDashboardReviewGate } from "../../launch/creatorDashboardReviewGate";
import { deriveWhatsNextHeadline } from "../../launch/dashboardWhatsNextPresentation";
import {
  formatCreatorSigningProgressLabel,
  resolveCreatorSigningProgressSnapshot,
} from "../../launch/creatorDashboardSigningProgress";
import { REVIEW_AHA_REASSURANCE } from "../../launch/simpleProduct/guidedWorkflowCopy";
import {
  SIMPLE_CREATE_PAID_PRO_REVIEW_CONTROL_LINE,
} from "../../launch/simpleProduct/simpleCreatePaidProReviewShell";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import {
  hasCanonicalReviewCorpusForRender,
  resolveCanonicalReviewCorpusLenForRender,
} from "./paidProDocumentBodyRouter";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import { countOperativeIfToNoticeStanzas } from "./paidProPartyNoticeDetails";
import {
  evaluateProfessionalCorpusContamination,
  extractPartyShortLabelTokens,
} from "./paidProProfessionalCorpusContamination";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import { resolvePaidProReviewBranchPath } from "./paidProReviewBranchInstrumentation";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { markPaidProPipelineValidationPassed } from "./paidProPostAcceptanceValidatorCache";
import {
  clearPremiumPartyNamesHandoff,
  linearPremiumRecipientSlots,
  readPremiumRecipientHandoff,
  resolveHandoffPartySlotCount,
  writePremiumRecipientHandoffFromAuthorityParties,
} from "./premiumPartyNamesHandoff";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { readFrozenCanonicalManifestPartyCount } from "./frozenCanonicalManifestAuthority";
import { padOperativeCorpusBeforeWitness } from "./paidProTestAcceptedQuadPartyCorpus";
import {
  countPartyBlocksInExecutionTail,
  executionTail,
} from "./paidProTest423Helpers";
import {
  buildTest427Corpus,
  TEST427_FORBIDDEN_ENTITY_MARKERS,
  type Test427Scenario,
} from "./paidProTest427Fixtures";
import {
  test428Fail,
  type Test428UxSurface,
} from "./paidProTest428JourneyMatrix";
import {
  PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA,
  PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA,
} from "./signerSetupPartyIdentity";
import {
  computePaidProReviewScrollPaddingPx,
  PAID_PRO_STICKY_CTA_BUFFER_PX,
  PaidProReviewStickyScrollSpacer,
} from "./paidProStickyBottomInset";
import { resolvePaidProStickyCta } from "./paidProStickyCta";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import type { PaidProSignerMetadataParty } from "./paidProSignerMetadataAuthority";
import { setConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { CREATOR_PREPARE_SIGNATURE_LINKS_LABEL } from "../../launch/creatorDashboardCopy";

export type Test428UxContext = {
  scenario: Test427Scenario;
  sot: string;
  reviewPlain: string;
};

function minReviewLen(n: number): number {
  return Math.max(2000, n * 650);
}

function buildJourneyCorpus(scenario: Test427Scenario): string {
  return padOperativeCorpusBeforeWitness(
    buildTest427Corpus(scenario),
    Math.max(5200, scenario.expectedN * 900),
  );
}

function completeAuthorityParties(scenario: Test427Scenario): PaidProSignerMetadataParty[] {
  return scenario.parties.map((partyLegalName, partyIndex) => ({
    partyIndex,
    partyLegalName,
    signerEmail:
      scenario.emails[partyIndex]?.includes("@")
        ? scenario.emails[partyIndex]!
        : `complete.party${partyIndex}@genesisdog428.example.com`,
    signerName:
      (scenario.signerNames[partyIndex] ?? "").trim().length >= 2
        ? scenario.signerNames[partyIndex]!
        : `Signer Party ${partyIndex + 1}`,
    signerTitle:
      (scenario.signerTitles[partyIndex] ?? "").trim().length >= 2
        ? scenario.signerTitles[partyIndex]!
        : "Authorized Signatory",
    partyAddress: scenario.addresses[partyIndex] ?? "",
  }));
}

export function prepareTest428UxContext(scenario: Test427Scenario): Test428UxContext {
  const corpus = buildJourneyCorpus(scenario);
  const prep = preparePaidProServerDocumentForAcceptance(corpus, scenario.draft, scenario.intakeText);
  const accepted = padOperativeCorpusBeforeWitness(prep.text, 2000);
  markPaidProPipelineValidationPassed({ text: accepted, source: "server_full_draft" });
  establishPaidProSourceOfTruth({
    text: accepted,
    source: "server_full_draft",
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  if (!hasPaidProSourceOfTruth()) {
    test428Fail("review_surface", "SoT not established for UX context");
  }
  const sot = getPaidProSourceOfTruthText();
  const reviewPlain = resolvePaidProReviewRenderPlain({
    draft: scenario.draft,
    intakeText: scenario.intakeText,
  });
  return { scenario, sot, reviewPlain };
}

function assertNoFixtureContamination(text: string, surface: Test428UxSurface): void {
  const upper = text.toUpperCase();
  for (const marker of TEST427_FORBIDDEN_ENTITY_MARKERS) {
    if (upper.includes(marker)) {
      test428Fail(surface, `fixture contamination: ${marker}`);
    }
  }
}

export function assertTest428ReviewSurface(ctx: Test428UxContext): void {
  const { scenario, sot, reviewPlain } = ctx;
  if (!hasCanonicalReviewCorpusForRender()) {
    test428Fail("review_surface", "documentMounted=false — canonical review corpus missing");
  }
  const len = resolveCanonicalReviewCorpusLenForRender();
  if (len < minReviewLen(scenario.expectedN)) {
    test428Fail("review_surface", `review corpus too short (${len})`);
  }
  if (reviewPlain.trim().length < minReviewLen(scenario.expectedN)) {
    test428Fail("review_surface", "blank or thin review render");
  }
  for (const party of scenario.parties) {
    if (!reviewPlain.includes(party.split(" ")[0]!)) {
      test428Fail("review_surface", `review missing party ${party}`);
    }
  }
  const branch = resolvePaidProReviewBranchPath({
    premiumPaidDocumentSurface: true,
    showPaidProReviewDocumentCard: true,
    proUpgradeUseStarterView: false,
    paidProForcedFirstReviewActive: true,
    guidedPreReviewSignerSetupActive: false,
    paidProAwaitingRuntimeAuthority: false,
    simpleProFinalReviewShellActive: false,
    failedPremiumCorpusActive: false,
    premiumReturnWaitActive: false,
  });
  if (branch.path === "blocked_can_display") {
    test428Fail("review_surface", `review blocked: ${branch.reason ?? "can_display"}`);
  }
  if (sot.trim().length < 500) {
    test428Fail("review_surface", "empty SoT with review CTA-ready state");
  }
  assertNoFixtureContamination(reviewPlain, "review_surface");
  if (countPaidProExecutionBlocks(reviewPlain) !== 1) {
    test428Fail("review_surface", `review has ${countPaidProExecutionBlocks(reviewPlain)} execution blocks`);
  }
}

export function assertTest428SectionFormatting(ctx: Test428UxContext): void {
  const { scenario, sot, reviewPlain } = ctx;
  const contamination = evaluateProfessionalCorpusContamination(sot, {
    partyNames: scenario.parties,
    partyCount: scenario.expectedN,
    intakeText: scenario.intakeText,
    signerNames: scenario.signerNames,
  });
  if (!contamination.ok) {
    test428Fail(
      "section_formatting",
      contamination.issues.map((i) => i.code).join("; "),
    );
  }
  const orphanPatterns = [
    /^\s*\d+\.\d+\s+Section\s*$/im,
    /^\s*\d+\.\d+\s+General Provisions\s*$/im,
    /\d+\.\d+\s+[A-Z][a-z]+\s+\d+\.\d+\s+[A-Z]/,
  ];
  for (const re of orphanPatterns) {
    if (re.test(reviewPlain)) {
      test428Fail("section_formatting", `bad heading pattern: ${re.source}`);
    }
  }
  const witnessIdx = sot.search(/\bIN WITNESS WHEREOF\b/i);
  if (witnessIdx >= 0) {
    const tail = sot.slice(witnessIdx);
    if (/^\s*\d+\.\s+SCOPE/im.test(tail) || /^\s*\d+\.\s+NOTICES/im.test(tail)) {
      test428Fail("section_formatting", "late duplicate operative section after witness");
    }
    if (
      /INDEPENDENT CONTRACTOR/i.test(tail) &&
      sot.slice(0, witnessIdx).match(/INDEPENDENT CONTRACTOR/gi)?.length
    ) {
      test428Fail("section_formatting", "duplicate independent contractor block after witness");
    }
  }
  const tokens = extractPartyShortLabelTokens(scenario.parties);
  if (tokens.length >= 2) {
    const glued = tokens.join(" ");
    if (reviewPlain.toUpperCase().includes(glued) && !scenario.parties.some((p) => reviewPlain.includes(p))) {
      test428Fail("section_formatting", `party-token chain: ${glued.slice(0, 40)}`);
    }
  }
}

export function assertTest428SignerHydration(ctx: Test428UxContext): void {
  const { scenario } = ctx;
  const complete = completeAuthorityParties(scenario);
  clearPremiumPartyNamesHandoff();
  writePremiumRecipientHandoffFromAuthorityParties(complete);
  setConsumedPaidProSignerMetadataAuthority({
    parties: complete,
    source: "authoritative_write",
    hash: `test428_${scenario.id}`,
    updatedAt: Date.now(),
  });

  const manifestCount = readFrozenCanonicalManifestPartyCount();
  if (manifestCount !== scenario.expectedN) {
    test428Fail("signer_hydration", `manifest party count ${manifestCount}`);
  }

  const handoff = readPremiumRecipientHandoff();
  const slots = linearPremiumRecipientSlots(handoff, scenario.expectedN);
  if (slots.length !== scenario.expectedN) {
    test428Fail("signer_hydration", `handoff slots ${slots.length}`);
  }

  for (let i = 0; i < scenario.expectedN; i++) {
    const slot = slots[i]!;
    const expected = complete[i]!;
    if (!slot.name.toLowerCase().includes(scenario.parties[i]!.split(" ")[0]!.toLowerCase())) {
      test428Fail("signer_hydration", `slot ${i} entity mismatch`);
    }
    if (!slot.email.includes("@")) {
      test428Fail("signer_hydration", `slot ${i} email missing`);
    }
    if (expected.signerName && scenario.signerNames[i]?.trim()) {
      if (slot.signerName !== expected.signerName) {
        test428Fail("signer_hydration", `slot ${i} signer name drift`);
      }
    }
    const signerName = (slot.signerName ?? "").trim();
    if (signerName && isAuthoritativeLegalEntityName(signerName)) {
      test428Fail("signer_hydration", `slot ${i} entity in signer name field`);
    }
    if (expected.signerTitle && scenario.signerTitles[i]?.trim() && slot.signerTitle !== expected.signerTitle) {
      test428Fail("signer_hydration", `slot ${i} title drift`);
    }
  }

  const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
    rawCorpus: ctx.sot,
    authority: { parties: complete, source: "authoritative_write", hash: "t428", updatedAt: 0 },
    intakeRaw: scenario.intakeText,
    surface: "test428_hydration",
    signatureRegionOnly: false,
    repairRecital: true,
  });
  if (hydrated.rejected) {
    test428Fail("signer_hydration", hydrated.rejectReason ?? "hydration rejected");
  }
  const blocks = countPartyBlocksInExecutionTail(hydrated.corpus, scenario.parties);
  if (blocks !== scenario.expectedN) {
    test428Fail("signer_hydration", `execution party blocks ${blocks}`);
  }
}

export function assertTest428StickyCta(ctx: Test428UxContext): void {
  const { scenario } = ctx;
  const incomplete = resolvePaidProStickyCta({
    hasAuthoritativeSigningSnapshot: false,
    signerDetailsComplete: false,
    inlineSignerSetupLatched: true,
    signaturePreparationRequested: false,
    sendSurfaceReady: false,
  });
  if (incomplete.label !== PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA) {
    test428Fail("sticky_cta", `expected incomplete CTA got ${incomplete.label}`);
  }
  if (!incomplete.showStickyBar) {
    test428Fail("sticky_cta", "sticky bar hidden while signer details required");
  }

  const complete = resolvePaidProStickyCta({
    hasAuthoritativeSigningSnapshot: false,
    signerDetailsComplete: true,
    inlineSignerSetupLatched: true,
    signaturePreparationRequested: false,
    sendSurfaceReady: false,
  });
  if (complete.label !== PAID_PRO_SIGNER_DETAILS_COMPLETE_CTA) {
    test428Fail("sticky_cta", `expected complete CTA got ${complete.label}`);
  }

  const scrollPadding = computePaidProReviewScrollPaddingPx({ ctaHeightPx: 88, safeAreaInsetBottomPx: 0 });
  if (scrollPadding < 88 + PAID_PRO_STICKY_CTA_BUFFER_PX) {
    test428Fail("sticky_cta", "scroll padding formula too small");
  }
  render(createElement(PaidProReviewStickyScrollSpacer, { heightPx: scrollPadding }));
  const spacer = screen.getByTestId("paid-pro-review-bottom-spacer");
  if (!spacer.style.height || spacer.style.height === "0px") {
    test428Fail("sticky_cta", "bottom spacer missing");
  }

  if (scenario.category === "metadata_stress") {
    const partialCta = resolvePaidProStickyCta({
      hasAuthoritativeSigningSnapshot: false,
      signerDetailsComplete: false,
      inlineSignerSetupLatched: true,
      signaturePreparationRequested: false,
      sendSurfaceReady: false,
    });
    if (partialCta.label !== PAID_PRO_SIGNER_DETAILS_INCOMPLETE_CTA) {
      test428Fail("sticky_cta", "partial metadata should require signer details");
    }
  }
}

function workspaceRow(
  scenario: Test427Scenario,
  overrides: Partial<WorkspaceIndexAgreement> = {},
): WorkspaceIndexAgreement {
  return {
    id: `ag_test428_${scenario.id}`,
    title: scenario.draft.title ?? "Agreement",
    updated_at: new Date().toISOString(),
    party_count: scenario.expectedN,
    signer_count: scenario.expectedN,
    version_ledger_count: 1,
    completed_signed: false,
    has_server_signing_lock: false,
    locked_version_id: null,
    workspace_archived_at: null,
    review_sent_at: new Date().toISOString(),
    reviewer_approved: false,
    all_reviewers_approved: false,
    review_approvals_required: scenario.expectedN,
    review_approvals_completed: 0,
    ...overrides,
  };
}

export function assertTest428LifecycleCopy(ctx: Test428UxContext): void {
  const { scenario } = ctx;
  if (!REVIEW_AHA_REASSURANCE.includes("Nothing is sent or signed")) {
    test428Fail("lifecycle_copy", "review reassurance copy missing");
  }
  if (!SIMPLE_CREATE_PAID_PRO_REVIEW_CONTROL_LINE.includes("Nothing is sent or signed")) {
    test428Fail("lifecycle_copy", "Pro review control line missing");
  }
  if (CREATOR_PREPARE_SIGNATURE_LINKS_LABEL.toLowerCase().includes("send email")) {
    test428Fail("lifecycle_copy", "prepare signatures implies auto-send");
  }

  const n = scenario.expectedN;
  const rowPartial = workspaceRow(scenario, {
    review_approvals_completed: 1,
    has_server_signing_lock: true,
  });
  const snapPartial = resolveCreatorSigningProgressSnapshot(rowPartial, {
    signedCount: 1,
    requiredCount: n,
    fullySigned: false,
    partiallySigned: true,
    source: "local_packet",
  });
  if (snapPartial) {
    expectProgressLabel(formatCreatorSigningProgressLabel(snapPartial), "1 of", n);
  }

  const rowDone = workspaceRow(scenario, { completed_signed: true, review_approvals_completed: n });
  const gate = resolveCreatorDashboardReviewGate(rowDone, []);
  const headline = deriveWhatsNextHeadline(rowDone, gate, {
    signedCount: n,
    requiredCount: n,
    fullySigned: true,
    partiallySigned: false,
    source: "local_packet",
  });
  if (!headline.includes("fully signed")) {
    test428Fail("lifecycle_copy", `completed headline: ${headline}`);
  }
  if (!isAgreementCompletedForDashboard(rowDone)) {
    test428Fail("lifecycle_copy", "dashboard completion not detected");
  }

  const tailBlocks = countPartyBlocksInExecutionTail(ctx.sot, scenario.parties);
  if (tailBlocks !== n) {
    test428Fail("lifecycle_copy", `SoT execution blocks ${tailBlocks} !== ${n}`);
  }
  if (countPaidProExecutionBlocks(executionTail(ctx.sot)) > n) {
    test428Fail("lifecycle_copy", "duplicate collapsed execution blocks");
  }
}

function expectProgressLabel(label: string, fragment: string, n: number): void {
  if (!label.includes(fragment) && !label.includes(String(n))) {
    test428Fail("lifecycle_copy", `progress label unexpected: ${label}`);
  }
}

export function assertTest428AuthoritySignals(ctx: Test428UxContext): void {
  const { scenario, sot } = ctx;
  const noticeCount = countOperativeIfToNoticeStanzas(sot);
  if (scenario.requireNoticeStanzas !== false && noticeCount < scenario.expectedN) {
    test428Fail("authority_signals", `notice stanzas ${noticeCount} < ${scenario.expectedN}`);
  }

  const manifestCount = readFrozenCanonicalManifestPartyCount();
  if (manifestCount !== scenario.expectedN) {
    test428Fail("authority_signals", `signer count mismatch manifest=${manifestCount}`);
  }

  const complete = completeAuthorityParties(scenario);
  writePremiumRecipientHandoffFromAuthorityParties(complete);
  const handoff = readPremiumRecipientHandoff();
  const slotCount = resolveHandoffPartySlotCount(handoff!, scenario.expectedN);
  if (slotCount > scenario.expectedN) {
    test428Fail("authority_signals", `handoff partySlots ${slotCount} > canonical ${scenario.expectedN}`);
  }

  if (!hasCanonicalReviewCorpusForRender()) {
    test428Fail("authority_signals", "stale unfrozen corpus used for render");
  }

  if (/^\s*\d+\.\d+\s+Section\s*$/im.test(sot)) {
    test428Fail("authority_signals", "synthetic malformed heading accepted in SoT");
  }
}

export function runTest428UxSurface(ctx: Test428UxContext, surface: Test428UxSurface): void {
  switch (surface) {
    case "review_surface":
      assertTest428ReviewSurface(ctx);
      break;
    case "section_formatting":
      assertTest428SectionFormatting(ctx);
      break;
    case "signer_hydration":
      assertTest428SignerHydration(ctx);
      break;
    case "sticky_cta":
      assertTest428StickyCta(ctx);
      break;
    case "lifecycle_copy":
      assertTest428LifecycleCopy(ctx);
      break;
    case "authority_signals":
      assertTest428AuthoritySignals(ctx);
      break;
    default:
      test428Fail(surface, `unknown surface ${surface}`);
  }
}

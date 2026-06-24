/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import { buildAgreementPreviewText } from "./agreementPreviewFromDraft";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { rejectPaidProCorpusDuplication } from "./paidProCorpusDuplicationAuthority";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  markCurrentSessionProEntitlementComplete,
  markCurrentSessionProIntent,
} from "./paidProSessionEligibility";
import {
  persistPremiumRecipientHandoff,
} from "./premiumPartyNamesHandoff";
import {
  establishPaidProSourceOfTruth,
  getPaidProSourceOfTruthText,
  hasPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import {
  buildPaidProFreezeCandidate,
  resolvePaidProFreezeCommitText,
} from "./paidProFreezeCandidate";
import { paidProPipelineAcceptedCorpusHash } from "./paidProPipelineAcceptedCorpus";
import { resolveSimpleProFinalReviewCorpus } from "./simpleProFinalReviewCorpus";
import { isAuthoritativePremiumPipelineRenderSource } from "./premiumRenderSourceResolver";
import {
  resolvePremiumPreValidationBody,
  isSubstantivePremiumServerFullDocument,
} from "./premiumPreValidationBodyAuthority";
import {
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { resolveNoticeStructuralValidationParties } from "./paidProPartyNoticeDetails";
import {
  extractLineSeparatedLegalEntityParties,
} from "./partySlotIdentityNormalize";
import { isAuthoritativeLegalEntityName } from "./paidProPartyNamePreserve";
import {
  buildTest444ServerFullDraft,
  TEST444_HARBOR_PEAK,
  TEST444_INTAKE,
  TEST444_MIN_SERVER_LEN,
  TEST444_RED_MESA,
  test444Draft,
} from "./paidProTest444Fixtures";
import { buildTest442ShortDocumentText } from "./paidProTest442Fixtures";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import type { PremiumFullDraftResult } from "./premiumFullDraftApi";

const STARTER_FALLBACK =
  "Starter draft preview — short fallback corpus for TEST426 Frankenstein guard.";

function emptyConsumedAuthorityParties(): PaidProSignerMetadataParty[] {
  return [
    {
      partyIndex: 0,
      partyLegalName: "",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    },
    {
      partyIndex: 1,
      partyLegalName: "",
      signerEmail: "",
      signerName: "",
      signerTitle: "",
      partyAddress: "",
    },
  ];
}

function countTopLevelPaymentHeadings(text: string): number {
  return (text.match(/^\s*\d+\.\s+PAYMENT\s+AND\s+CONSIDERATION\s*$/gim) ?? []).length;
}

function countPreamblePhrase(text: string): number {
  return (
    text.match(/\bentered\s+into\s+as\s+of\s+the\s+Effective\s+Date\s+by\s+and\s+between\b/gi) ??
    []
  ).length;
}

function canonicalAuthorityPartyCount(
  parties: PaidProSignerMetadataParty[],
  roleContext: {
    intakeText: string;
    draftPartyNames: string[];
    acceptedCorpus: string;
  },
): number {
  const enriched = resolveNoticeStructuralValidationParties(parties, roleContext);
  return enriched.filter(
    (p) =>
      String(p.partyLegalName ?? "").trim().length >= 2 &&
      isAuthoritativeLegalEntityName(p.partyLegalName.trim()),
  ).length;
}

describe("TEST426 — short intake corpus dedupe and single-source Pro authority", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    vi.stubGlobal("sessionStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => storage.set(k, v),
      removeItem: (k: string) => storage.delete(k),
      clear: () => storage.clear(),
    });
    resetPaidProPipelineTestIsolation();
    markCurrentSessionProIntent();
    markCurrentSessionProEntitlementComplete();
    getOrInitSessionAgreementGenerationId();
  });

  afterEach(() => {
    resetPaidProPipelineTestIsolation();
    storage.clear();
    vi.unstubAllGlobals();
  });

  it("line-separated intake establishes Red Mesa Client / Harbor Peak Service Provider order", () => {
    const lineParties = extractLineSeparatedLegalEntityParties(TEST444_INTAKE);
    expect(lineParties).toEqual([TEST444_RED_MESA, TEST444_HARBOR_PEAK]);
    const draft = test444Draft();
    expect(draft.parties?.[0]?.name).toBe(TEST444_RED_MESA);
    expect(draft.parties?.[0]?.role).toBe("Client");
    expect(draft.parties?.[1]?.name).toBe(TEST444_HARBOR_PEAK);
    expect(draft.parties?.[1]?.role).toBe("Service Provider");
  });

  it("free starter preview names Red Mesa Client and Harbor Peak Service Provider — not Red Mesa twice", () => {
    const free = buildAgreementPreviewText(test444Draft(), {
      starterPreview: true,
      intakeText: TEST444_INTAKE,
    });
    expect(free).toContain(TEST444_RED_MESA);
    expect(free).toContain(TEST444_HARBOR_PEAK);
    expect(free).not.toContain("Harbor Harbor");
    expect(free).not.toMatch(/\bParty 1\b/);
    expect(free).not.toMatch(/\bParty 2\b/);
    expect(free).toMatch(
      new RegExp(
        `${TEST444_RED_MESA.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(\\s*["']?Client["']?\\s*\\)`,
        "i",
      ),
    );
    expect(free).toMatch(
      new RegExp(
        `${TEST444_HARBOR_PEAK.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(\\s*["']?Service Provider["']?\\s*\\)`,
        "i",
      ),
    );
  });

  it("pre-validation adopts substantive server full — never validates thin starter shell", () => {
    const shortDoc = buildTest442ShortDocumentText();
    const serverFull = buildTest444ServerFullDraft();
    const effectiveFull = {
      document_text: shortDoc,
      server_full_document_text: serverFull,
      generation_outcome: "ok",
    } as PremiumFullDraftResult;
    expect(isSubstantivePremiumServerFullDocument(serverFull.length, effectiveFull)).toBe(true);

    const adopted = resolvePremiumPreValidationBody({
      clientDocumentText: shortDoc,
      effectiveFull,
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      wireServerFullDocumentText: serverFull,
    });
    expect(adopted.adoptedServerFull).toBe(true);
    expect(adopted.text.length).toBeGreaterThan(shortDoc.length * 2);
    expect(adopted.text.length).toBeGreaterThan(TEST444_MIN_SERVER_LEN - 500);
    expect(adopted.text).toContain(TEST444_RED_MESA);
    expect(adopted.text).toContain(TEST444_HARBOR_PEAK);
  });

  it("freeze prep + validation share one canonical corpus hash — no Frankenstein stitch", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: emptyConsumedAuthorityParties(),
      source: "live_ui",
      hash: "test426-freeze",
      updatedAt: Date.now(),
    });
    persistPremiumRecipientHandoff({
      party1: { name: "", email: "", role: "Client" },
      party2: { name: "", email: "", role: "Service Provider" },
    });

    const server = buildTest444ServerFullDraft();
    const adopted = resolvePremiumPreValidationBody({
      clientDocumentText: buildTest442ShortDocumentText(),
      effectiveFull: {
        document_text: buildTest442ShortDocumentText(),
        server_full_document_text: server,
        generation_outcome: "ok",
      } as PremiumFullDraftResult,
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      wireServerFullDocumentText: server,
    }).text;

    const prepared = preparePaidProServerDocumentForAcceptance(
      adopted,
      test444Draft(),
      TEST444_INTAKE,
      { surface: "test426_prepare" },
    );

    const freezeCandidate = buildPaidProFreezeCandidate({
      text: prepared.text,
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      source: "server_full_draft",
      surface: "test426_freeze_candidate",
    });
    expect(freezeCandidate.ok, freezeCandidate.rejectReason ?? "freeze_failed").toBe(true);
    const preparedHash = paidProPipelineAcceptedCorpusHash(freezeCandidate.text);
    expect(freezeCandidate.hash).toBe(preparedHash);

    const validation = validatePaidProOutput({
      text: freezeCandidate.text,
      rawIntake: TEST444_INTAKE,
      draft: test444Draft(),
      premiumPipelineSource: "server_full_draft",
    });

    expect(validation.ok, validation.reasons.join("|") || "validation_failed").toBe(true);
    const postValidationFreeze = buildPaidProFreezeCandidate({
      text: freezeCandidate.text,
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      source: "server_full_draft",
      surface: "test426_post_validation_hash",
    });
    expect(postValidationFreeze.ok).toBe(true);
    expect(postValidationFreeze.hash).toBe(preparedHash);

    const dup = rejectPaidProCorpusDuplication(freezeCandidate.text);
    expect(dup.ok, dup.reasons.join("|")).toBe(true);
    expect(countTopLevelPaymentHeadings(freezeCandidate.text)).toBeLessThanOrEqual(1);
    expect(countPreamblePhrase(freezeCandidate.text)).toBeLessThanOrEqual(1);
    expect(freezeCandidate.text).not.toContain("Harbor Harbor");
    expect(freezeCandidate.text).not.toMatch(/\bParty 1\b/);
    expect(freezeCandidate.text).not.toMatch(/\bParty 2\b/);
  });

  it("notice authority hydrates two canonical parties from short intake", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: emptyConsumedAuthorityParties(),
      source: "live_ui",
      hash: "test426-notice",
      updatedAt: Date.now(),
    });

    const server = buildTest444ServerFullDraft();
    const reviewParties = resolvePartiesForReviewRender({
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
    });
    const noticeParties = resolveNoticeStructuralValidationParties(reviewParties, {
      intakeText: TEST444_INTAKE,
      draftPartyNames: test444Draft().parties?.map((p) => p.name) ?? [],
      acceptedCorpus: server,
    });
    expect(noticeParties[0]?.partyLegalName).toBe(TEST444_RED_MESA);
    expect(noticeParties[1]?.partyLegalName).toBe(TEST444_HARBOR_PEAK);

    const authorityCount = canonicalAuthorityPartyCount(emptyConsumedAuthorityParties(), {
      intakeText: TEST444_INTAKE,
      draftPartyNames: test444Draft().parties?.map((p) => p.name) ?? [],
      acceptedCorpus: server,
    });
    expect(authorityCount).toBe(2);
  });

  it("establishes long server_full_draft SoT — not starter Frankenstein fallback", () => {
    const server = buildTest444ServerFullDraft();
    const prepared = preparePaidProServerDocumentForAcceptance(
      server,
      test444Draft(),
      TEST444_INTAKE,
      { surface: "test426_sot_prepare" },
    );

    const freezeCommit = resolvePaidProFreezeCommitText({
      text: prepared.text,
      source: "server_full_draft",
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      surface: "test426_sot_freeze",
    });
    expect(freezeCommit.ok, freezeCommit.rejectReason ?? "freeze_failed").toBe(true);
    expect(freezeCommit.text.length).toBeGreaterThan(10000);

    establishPaidProSourceOfTruth({
      text: freezeCommit.text,
      source: "server_full_draft",
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
      reviewSessionId: "gen-test426-sot",
    });

    expect(hasPaidProSourceOfTruth()).toBe(true);
    const sot = getPaidProSourceOfTruthText();
    expect(sot.length).toBeGreaterThan(10000);
    expect(sot).toContain(TEST444_RED_MESA);
    expect(sot).toContain(TEST444_HARBOR_PEAK);
    expect(isAuthoritativePremiumPipelineRenderSource("server_full_draft")).toBe(true);

    const reviewPlain = resolvePaidProReviewRenderPlain({
      draft: test444Draft(),
      intakeText: TEST444_INTAKE,
    });
    expect(reviewPlain.trim().length).toBeGreaterThan(10000);

    const finalReview = resolveSimpleProFinalReviewCorpus({
      authoritativePlain: sot,
      renderedPreviewPlain: STARTER_FALLBACK,
      finalReviewAuthorityOnly: true,
    });
    expect(finalReview.source).not.toBe("rejected_paid_corpus");
    expect(finalReview.source).not.toBe("free_starter");
    expect(finalReview.plainText.length).toBeGreaterThan(10000);
    expect(finalReview.authoritativeLen).toBeGreaterThan(10000);
    expect(finalReview.plainText).toContain(TEST444_HARBOR_PEAK);
    expect(finalReview.plainText).not.toContain(STARTER_FALLBACK);
  });
});

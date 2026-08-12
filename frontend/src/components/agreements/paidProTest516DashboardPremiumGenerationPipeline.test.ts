/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrInitSessionAgreementGenerationId } from "../../lib/agreementGenerationId";
import {
  clearCurrentSessionProEntitlementMarkers,
  markCurrentSessionProEntitlementComplete,
} from "./paidProSessionEligibility";
import {
  markPaidDashboardCreateContextForTests,
  clearPaidDashboardCreateContextForTests,
} from "../../launch/paidDashboardCreateContext";
import { markAuthenticatedWorkspaceSession } from "../../launch/completedAgreementViewContext";
import { resetPaidProPipelineTestIsolation } from "./paidProPipelineTestIsolation";
import {
  clearPaidProPostAcceptanceValidatorCache,
} from "./paidProPostAcceptanceValidatorCache";
import { validatePaidProOutput } from "./paidProCorpusAcceptance";
import { resolveAgreementIntentContract } from "./agreementIntentContract";
import { resolveValidatedPaidProReviewCorpus } from "./paidProReviewAuthority";
import { resolveGuidedCompletionRenderDocument } from "./guidedDealCompletion/guidedCompletionRenderAuthority";
import {
  ENTITLED_REWRITE_DRAFT_SNAPSHOT_HELPER,
  ENTITLED_REWRITE_LAUNCH_HELPER,
  planEntitledRewriteGenerationFailureTerminal,
  resolveEntitledRewriteLaunchContext,
  shouldTreatEntitledRewritePipelineResultAsGenerationFailure,
  stripLocalParsePremiumCorpusFromDraft,
  syncEntitledRewriteDraftSnapshot,
} from "./paidProEntitledRewriteLaunch";
import type { PremiumCompletionResult } from "./premiumCompletionPipeline";
import {
  TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
  buildTest519MalformedProfessionalServerBody,
  test519Draft,
} from "./paidProTest519Fixtures";
import { TEST501_ACCEPTED_PAID_BODY } from "./paidProTest501Fixtures";
import { PAID_PRO_AUTHORITY_MIN_LEN } from "./paidProAuthorityConstants";
import { CreateUiStage } from "./createUiStage";

const intakeSrc = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
const THIN_STARTER_BODY = "Thin starter clause. ".repeat(20);

describe("TEST516 — dashboard premium generation pipeline (not routing)", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidDashboardCreateContextForTests();
    markAuthenticatedWorkspaceSession();
    markPaidDashboardCreateContextForTests("dashboard_paid_create");
    getOrInitSessionAgreementGenerationId();
    markCurrentSessionProEntitlementComplete({ source: "entitled_rewrite" });
    vi.stubGlobal("location", { ...window.location, pathname: "/app/create" });
  });

  afterEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    resetPaidProPipelineTestIsolation();
    clearPaidProPostAcceptanceValidatorCache();
    clearPaidDashboardCreateContextForTests();
    clearCurrentSessionProEntitlementMarkers();
    vi.restoreAllMocks();
  });

  it("1 — stale draft snapshot aborts launch (entitled_rewrite_aborted root cause)", () => {
    const ctx = resolveEntitledRewriteLaunchContext({
      draftSnapshot: null,
      draftState: null,
      resumeDraft: null,
      resolveRawIntake: () => TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
    });
    expect(ctx.ok).toBe(false);
    if (!ctx.ok) expect(ctx.reason).toBe("missing_gate_draft");
  });

  it("2 — synced snapshot + production intake launches entitled rewrite", () => {
    const draft = test519Draft();
    const ref = { current: null as ReturnType<typeof test519Draft> | null };
    const synced = syncEntitledRewriteDraftSnapshot(ref, draft);
    expect(ref.current).toBe(synced);
    const ctx = resolveEntitledRewriteLaunchContext({
      gateDraftOverride: synced,
      rawIntakeOverride: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      resolveRawIntake: () => "",
    });
    expect(ctx.ok).toBe(true);
    if (ctx.ok) {
      expect(ctx.rawIntake.length).toBeGreaterThan(100);
      expect(ctx.gateDraft.parties?.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("3 — strips thin local-parse server_full_document_text before premium POST", () => {
    const draft = {
      ...test519Draft(),
      server_full_document_text: THIN_STARTER_BODY,
      premium_full_document_text: THIN_STARTER_BODY,
    } as ReturnType<typeof test519Draft> & {
      server_full_document_text: string;
      premium_full_document_text: string;
    };
    expect(THIN_STARTER_BODY.length).toBeGreaterThan(0);
    expect(THIN_STARTER_BODY.length).toBeLessThan(PAID_PRO_AUTHORITY_MIN_LEN);
    const stripped = stripLocalParsePremiumCorpusFromDraft(draft);
    expect(String((stripped as { server_full_document_text?: string }).server_full_document_text ?? "").trim()).toBe("");
    expect(String(stripped.premium_full_document_text ?? "").trim()).toBe("");
  });

  it("4 — thin pipeline winning body is generation failure — never reaches validation", () => {
    const thin: PremiumCompletionResult = {
      premiumDraft: test519Draft(),
      premiumParties: [],
      recipientCandidates: [],
      winningPremiumBodyText: THIN_STARTER_BODY,
      premiumRenderSource: "server_full_draft",
      premiumReview: null,
      premiumFinalizeAudit: null,
      premiumReviewRoute: null,
      agreementGenerationId: getOrInitSessionAgreementGenerationId(),
      premiumRequestIntakeFingerprint: "fp",
      staleIntakeOrGeneration: false,
      founderDetailsGateMessage: null,
      proIntentGateMessage: null,
      serverGenerationDegraded: null,
    };
    expect(shouldTreatEntitledRewritePipelineResultAsGenerationFailure(thin)).toBe(true);
    const malformed = buildTest519MalformedProfessionalServerBody();
    const validation = validatePaidProOutput({
      text: malformed,
      rawIntake: TEST519_PRODUCTION_QUAD_PARTY_INTAKE,
      intentContract: resolveAgreementIntentContract(TEST519_PRODUCTION_QUAD_PARTY_INTAKE),
      draft: test519Draft(),
      premiumPipelineSource: "server_full_document_text",
    });
    expect(validation.ok).toBe(false);
    expect(resolveValidatedPaidProReviewCorpus().len).toBe(0);
  });

  it("5 — generation failure terminal keeps retry on dashboard without review corpus", () => {
    const terminal = planEntitledRewriteGenerationFailureTerminal({
      reason: "entitled_rewrite_aborted",
      dashboardRoute: true,
    });
    expect(terminal.proFullDraftQualityRetry).toBe(false);
    expect(terminal.premiumPersistedFlowActive).toBe(false);
    expect(terminal.agreementDocumentPlain).toBe("");
    // Recovery must leave generating_draft so wait modal / Structuring CTA cannot stick.
    expect(terminal.displayPhase).toBe("intake");
    expect(terminal.createFlowPhase).toBe("capturing_input");
    expect(terminal.premiumPostCheckoutPhase).toBe(null);
    expect(terminal.createUiStage).toBe(CreateUiStage.INPUT);
    expect(terminal.hardError).toMatch(/unchanged/i);
  });

  it("6 — accepted premium body passes generation gate", () => {
    const ok: PremiumCompletionResult = {
      premiumDraft: test519Draft(),
      premiumParties: [],
      recipientCandidates: [],
      winningPremiumBodyText: TEST501_ACCEPTED_PAID_BODY,
      premiumRenderSource: "server_full_draft",
      premiumReview: null,
      premiumFinalizeAudit: null,
      premiumReviewRoute: null,
      agreementGenerationId: getOrInitSessionAgreementGenerationId(),
      premiumRequestIntakeFingerprint: "fp",
      staleIntakeOrGeneration: false,
      founderDetailsGateMessage: null,
      proIntentGateMessage: null,
      serverGenerationDegraded: null,
    };
    expect(shouldTreatEntitledRewritePipelineResultAsGenerationFailure(ok)).toBe(false);
  });

  it("7 — no guided render from malformed corpus after generation failure", () => {
    const malformed = buildTest519MalformedProfessionalServerBody();
    const render = resolveGuidedCompletionRenderDocument({
      guidedCompletionActive: false,
      postGuidedAuthoritativeReview: true,
      paidProCreateFlowReviewGate: true,
      validatedCorpusPlain: "",
      pickerPlain: malformed.slice(0, 1286),
      pickerSource: "server_full_document_text",
    });
    expect(render.source).toBe("none");
    expect(render.plainText.trim().length).toBe(0);
  });

  it("8 — intake syncs draft snapshot before entitled rewrite on paid create submit", () => {
    expect(intakeSrc).toContain(ENTITLED_REWRITE_LAUNCH_HELPER);
    expect(intakeSrc).toContain(ENTITLED_REWRITE_DRAFT_SNAPSHOT_HELPER);
    expect(intakeSrc).toContain("shouldTreatEntitledRewritePipelineResultAsGenerationFailure");
    expect(intakeSrc).toContain("syncEntitledRewriteDraftSnapshot(draftSnapshotRef, parsed)");
    expect(intakeSrc).toContain("runEntitledPremiumImprovementRewrite({");
  });
});

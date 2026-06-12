/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { buildHydratedAuthoritativeSigningCorpusFromAuthority } from "./authoritativeSignerHydration";
import { clearAuthoritativeSigningSnapshot } from "./authoritativeSigningSnapshot";
import { setPaidProPinnedSignerAppliedCorpus } from "./paidProFinalHydratedCorpus";
import { readCanonicalAgreementCorpusForSurface } from "./canonicalAgreementSnapshot";
import { summarizePaidProDocumentBlockClassifications } from "./paidProDocumentBlockClassifier";
import { countPaidProExecutionBlocks } from "./paidProExecutionBlockAuthority";
import { resolvePaidProAuthoritativeDisplayPlain } from "./paidProAuthoritativeRenderGate";
import { preparePaidProServerDocumentForAcceptance } from "./paidProConciseServicesQuality";
import {
  buildLivePaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
} from "./paidProSignerMetadataAuthority";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import { resolveAuthoritativePartySlotCount } from "./partySlotIdentityNormalize";
import { pickAuthoritativePlainForSendHandoff } from "./sendHandoffAuthoritativeCorpus";
import {
  buildTest336FlattenedProCorpus,
} from "./paidProTest336FormattingAndSignatureTailRegression.test";
import {
  clearPaidProPostAcceptanceValidatorCache,
  markPaidProPipelineValidationPassed,
} from "./paidProPostAcceptanceValidatorCache";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
  getPaidProDocumentForSurface,
  getPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const RED_MESA = "Red Mesa Logistics LLC";
const HARBOR_PEAK = "Harbor Peak Automation LLC";

const TEST336_INTAKE = [
  `Create a services agreement between ${RED_MESA} and ${HARBOR_PEAK}.`,
  `${HARBOR_PEAK} will provide AI workflow consulting, implementation support,`,
  "process documentation, configuration assistance, staff training, and automation deployment services.",
  "12 months. Fixed fee of $48,000 paid monthly. Oklahoma law.",
].join(" ");

function test336Draft(): ParsedDraftShape {
  return {
    title: "Services Agreement",
    jurisdiction: "Oklahoma",
    agreement_family: "services_agreement",
    parties: [
      { name: RED_MESA, role: "Client" },
      { name: HARBOR_PEAK, role: "Service Provider" },
    ],
    purpose:
      "AI workflow consulting, implementation support, process documentation, configuration assistance, staff training, and automation deployment services.",
    payment_terms: "Fixed fee of $48,000 paid monthly.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 48000, cadence: "monthly", valid: true },
  };
}

type LifecycleAuditRow = {
  stage: string;
  len: number;
  hash: string;
  executionBlockCount: number;
  headingCount: number;
  mainSectionHeadingCount: number;
  partySlotCount: number;
  openingRecitalPresent: boolean;
  witnessPresent: boolean;
  legalNamesIntact: boolean;
  staleSignaturesBlock: boolean;
  blankSignerPlaceholderLines: number;
  mutatesFromPrior?: string[];
};

function auditRow(stage: string, text: string, prior?: LifecycleAuditRow): LifecycleAuditRow {
  const summary = summarizePaidProDocumentBlockClassifications(text);
  const headingCount =
    summary.titleCount + summary.mainSectionHeadingCount + summary.legacySectionHeadingCount;
  const row: LifecycleAuditRow = {
    stage,
    len: text.length,
    hash: hashPaidProCorpus(text),
    executionBlockCount: countPaidProExecutionBlocks(text),
    headingCount,
    mainSectionHeadingCount: summary.mainSectionHeadingCount,
    partySlotCount: resolveAuthoritativePartySlotCount({
      intakeText: TEST336_INTAKE,
      draftPartyNames: [RED_MESA, HARBOR_PEAK],
      rawPartyCount: 2,
    }),
    openingRecitalPresent:
      /entered\s+into/i.test(text.slice(0, 3_000)) ||
      /is (?:between|entered)/i.test(text.slice(0, 3_000)),
    witnessPresent: /\bIN WITNESS WHEREOF\b/i.test(text),
    legalNamesIntact: text.includes(RED_MESA) && text.includes(HARBOR_PEAK),
    staleSignaturesBlock: /\bSIGNATURES\b\s+The\s+parties\s+have\s+caused/i.test(text),
    blankSignerPlaceholderLines: (text.match(/_{4,}/g) || []).length,
  };
  if (prior) {
    const mutates: string[] = [];
    if (row.hash !== prior.hash) mutates.push("hash");
    if (row.len !== prior.len) mutates.push("length");
    if (row.executionBlockCount !== prior.executionBlockCount) mutates.push("execution_blocks");
    if (row.headingCount !== prior.headingCount) mutates.push("section_formatting");
    if (row.legalNamesIntact !== prior.legalNamesIntact) mutates.push("legal_entity_names");
    if (row.staleSignaturesBlock !== prior.staleSignaturesBlock) mutates.push("stale_signature_tail");
    if (row.blankSignerPlaceholderLines !== prior.blankSignerPlaceholderLines) {
      mutates.push("signer_placeholders");
    }
    row.mutatesFromPrior = mutates;
  }
  return row;
}

function test336SignerAuthority() {
  return buildLivePaidProSignerMetadataAuthority({
    partyCount: 2,
    recipient1Name: RED_MESA,
    recipient2Name: HARBOR_PEAK,
    recipient1Email: "jordan@redmesa.test",
    recipient2Email: "avery@harborpeak.test",
    extraPartyReviewEmails: [],
    partySignerNames: ["Jordan Lee", "Avery Chen"],
    partySignerTitles: ["CEO", "President"],
    partyAddresses: [
      "100 Logistics Way, Oklahoma City, OK",
      "200 Automation Blvd, Tulsa, OK",
    ],
  });
}

afterEach(() => {
  clearPaidProSourceOfTruth();
  clearPaidProPostAcceptanceValidatorCache();
  clearAuthoritativeSigningSnapshot();
});

describe("paidProTest336LifecycleAudit", () => {
  it("traces test336 corpus through paid Pro lifecycle stages", () => {
    const draft = test336Draft();
    const opts = { draft, intakeText: TEST336_INTAKE };
    const rows: LifecycleAuditRow[] = [];

    const serverDraft = buildTest336FlattenedProCorpus();
    rows.push(auditRow("1_server_full_draft", serverDraft));

    const prepared = preparePaidProServerDocumentForAcceptance(serverDraft, draft, TEST336_INTAKE);
    rows.push(auditRow("2_preparePaidProServerDocumentForAcceptance", prepared.text, rows.at(-1)));

    markPaidProPipelineValidationPassed({ text: prepared.text, source: "server_full_draft_retry" });
    const sot = establishPaidProSourceOfTruth({
      text: prepared.text,
      source: "server_full_draft",
      draft,
      intakeText: TEST336_INTAKE,
    });
    rows.push(auditRow("3_establishPaidProSourceOfTruth", sot.text, rows.at(-1)));

    const reviewRender = resolvePaidProReviewRenderPlain(opts);
    rows.push(auditRow("4_resolvePaidProReviewRenderPlain", reviewRender, rows.at(-1)));

    const authDisplay = resolvePaidProAuthoritativeDisplayPlain(opts);
    rows.push(auditRow("5_resolvePaidProAuthoritativeDisplayPlain", authDisplay, rows.at(-1)));

    const display = getPaidProDocumentForSurface("display", opts)!.text;
    rows.push(auditRow("6_review_surface_display", display, rows.at(-1)));

    const copy = getPaidProDocumentForSurface("copy", opts)!.text;
    rows.push(auditRow("7_copy_text_export", copy, rows.at(-1)));

    const signerSetup = getPaidProDocumentForSurface("signer_setup", opts)!.text;
    rows.push(auditRow("8_signer_setup_corpus", signerSetup, rows.at(-1)));

    const handoff = readCanonicalAgreementCorpusForSurface("handoff", { tier: "pro" });
    const reviewEmail =
      handoff?.canonicalText ??
      pickAuthoritativePlainForSendHandoff({
        premium_server_full_document_text: sot.text,
        premium_render_source: "server_full_document_text",
      } as Parameters<typeof pickAuthoritativePlainForSendHandoff>[0])?.text ??
      signerSetup;
    rows.push(auditRow("9_review_email_handoff", reviewEmail, rows.at(-1)));

    const authority = test336SignerAuthority();
    setConsumedPaidProSignerMetadataAuthority(authority);
    const hydrated = buildHydratedAuthoritativeSigningCorpusFromAuthority({
      rawCorpus: getPaidProSourceOfTruth()!.text,
      authority,
      intakeRaw: TEST336_INTAKE,
      surface: "test336_finalize",
      signatureRegionOnly: true,
    });
    setPaidProPinnedSignerAppliedCorpus(hydrated.corpus);
    const finalized = getPaidProDocumentForSurface("finalized", opts)!.text;
    rows.push(auditRow("10_final_signed_hydrated_corpus", finalized, rows.at(-1)));

    // eslint-disable-next-line no-console
    console.info("[test336-lifecycle-audit]", JSON.stringify(rows, null, 2));

    const sotRow = rows.find((r) => r.stage === "3_establishPaidProSourceOfTruth")!;
    const renderRow = rows.find((r) => r.stage === "4_resolvePaidProReviewRenderPlain")!;
    expect(sotRow.staleSignaturesBlock).toBe(false);
    expect(sotRow.executionBlockCount).toBe(1);
    expect(sotRow.legalNamesIntact).toBe(true);
    expect(sotRow.mainSectionHeadingCount).toBeGreaterThan(0);
    expect(renderRow.len - sotRow.len).toBeLessThanOrEqual(2);
    expect(renderRow.executionBlockCount).toBe(1);
    expect(renderRow.staleSignaturesBlock).toBe(false);

    const hydratedRow = rows.find((r) => r.stage === "10_final_signed_hydrated_corpus")!;
    expect(hydratedRow.hash).not.toBe(sotRow.hash);
    expect(hydratedRow.mutatesFromPrior).toContain("signer_placeholders");
    expect(hydratedRow.mutatesFromPrior).not.toContain("legal_entity_names");
    expect(hydratedRow.executionBlockCount).toBe(1);
    expect(finalized).toMatch(/Name:\s*Jordan Lee/i);
    expect(finalized).toMatch(/Name:\s*Avery Chen/i);
    expect(finalized).toContain(RED_MESA);
    expect(finalized).toContain(HARBOR_PEAK);
  });
});

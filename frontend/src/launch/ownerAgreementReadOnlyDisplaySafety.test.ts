/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AgreementDraft } from "../agreement/agreementTypes";
import * as agreementWorkspaceApi from "../agreement/agreementWorkspaceApi";
import { countPaidProExecutionBlocks } from "../components/agreements/paidProExecutionBlockAuthority";
import {
  extractMainSectionNumbers,
  extractVisiblePlainFromReviewHtml,
} from "../agreement/reviewFirstDocumentDisplayParity";
import {
  buildOwnerAgreementReadOnlyDisplayHtml,
  cloneOwnerReadOnlyDraft,
  freezeOwnerReadOnlyCorpus,
  loadOwnerAgreementReadOnlyPreview,
} from "./ownerAgreementReadOnlyView";

const BLUE = "Blue Canyon Analytics LLC";
const IRON = "Iron Vale Systems Inc.";

function paidProOwnerReadOnlyCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    `This Agreement is entered into as of the Effective Date by and between ${BLUE}, a Delaware limited liability company ("Client"), and ${IRON}, a California corporation ("Service Provider").`,
    "",
    "1. Services and Deliverables",
    "Service Provider shall deliver consulting and implementation services as described in Exhibit A.",
    "",
    "2. Compensation",
    "Client shall pay fees within thirty (30) days after receipt of invoice.",
    "",
    "3. Term",
    "This Agreement commences on the Effective Date and continues for one (1) year unless earlier terminated.",
    "",
    ...Array.from(
      { length: 7 },
      (_, i) =>
        `${i + 4}. Operative clause ${i + 1}.\n${"Each party shall perform in a professional and workmanlike manner. ".repeat(5)}`,
    ),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${BLUE}`,
    "By: _________________________________",
    "Name: Sarah Mitchell",
    "Title: CEO",
    "Email for Notice: legal@bluecanyon.example",
    "Address for Notice: 234 Rete St., Utes, UT 87432",
    "Date: _____________________________",
    "",
    `SERVICE PROVIDER: ${IRON}`,
    "By: _________________________________",
    "Name: Michael Torres",
    "Title: President",
    "Email for Notice: legal@ironvale.example",
    "Address for Notice: 309 Hue Avenue, El Annuncion, NM 84593",
    "Date: _____________________________",
  ].join("\n");
}

function paidProOwnerReadOnlyDraft(corpus: string): AgreementDraft {
  return {
    id: "ag_owner_readonly_safety",
    title: "Consulting Agreement",
    jurisdiction: "CA",
    parties: [
      { id: "p1", name: BLUE, role: "party" },
      { id: "p2", name: IRON, role: "reviewer", email: "iron@test.com" },
    ],
    purpose: corpus,
    payment_terms: "Net 30",
    duration: "1y",
    due_date: null,
    effective_date: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    versions: [{ version: 1, created_at: "2026-01-01T00:00:00.000Z" }],
    audit_log: [{ event_type: "review_sent", at: "2026-01-02T00:00:00.000Z" }],
  } as AgreementDraft;
}

function extractSignerMetadataLines(plain: string): string[] {
  return plain
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(name|title|email for notice|address for notice)\s*:/i.test(line));
}

function witnessCount(plain: string): number {
  return (plain.match(/\bIN WITNESS WHEREOF\b/gi) ?? []).length;
}

describe("ownerAgreementReadOnlyDisplaySafety", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not mutate resolved corpus, headings, witness count, or signer metadata during display render", () => {
    const corpus = paidProOwnerReadOnlyCorpus();
    const draft = paidProOwnerReadOnlyDraft(corpus);
    const corpusObject = freezeOwnerReadOnlyCorpus({
      text: corpus,
      source: "authoritative_signing_snapshot",
      hash: "safety-fixture",
    })!;
    const corpusSnapshot = corpus;
    const headingSnapshot = extractMainSectionNumbers(corpus);
    const witnessSnapshot = witnessCount(corpus);
    const signerSnapshot = extractSignerMetadataLines(corpus);
    const draftSnapshot = JSON.stringify(draft);

    const { html, corpusText } = buildOwnerAgreementReadOnlyDisplayHtml({
      draft,
      corpus: corpusObject,
    });

    expect(corpus).toBe(corpusSnapshot);
    expect(corpusText).toBe(corpusSnapshot);
    expect(extractMainSectionNumbers(corpus)).toEqual(headingSnapshot);
    expect(witnessCount(corpus)).toBe(witnessSnapshot);
    expect(extractSignerMetadataLines(corpus)).toEqual(signerSnapshot);
    expect(JSON.stringify(draft)).toBe(draftSnapshot);

    expect(html).toContain("<h1>MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT</h1>");
    expect((html.match(/class="premium-doc-section-heading"/g) ?? []).length).toBe(
      headingSnapshot.length,
    );
    expect(html).toMatch(/Sarah Mitchell/i);
    expect(html).toMatch(/Michael Torres/i);
  });

  it("renders exactly one execution block region and does not synthesize a decorative fallback signature card", () => {
    const corpus = paidProOwnerReadOnlyCorpus();
    const draft = paidProOwnerReadOnlyDraft(corpus);
    expect(countPaidProExecutionBlocks(corpus)).toBe(1);

    const { html } = buildOwnerAgreementReadOnlyDisplayHtml({
      draft,
      corpus: {
        text: corpus,
        source: "authoritative_signing_snapshot",
        hash: "safety-fixture",
      },
    });

    const visiblePlain = extractVisiblePlainFromReviewHtml(html);
    expect(countPaidProExecutionBlocks(visiblePlain)).toBe(1);
    expect(witnessCount(visiblePlain)).toBe(1);
    expect(html.match(/IN WITNESS WHEREOF/gi)?.length ?? 0).toBe(1);
    expect(html).not.toMatch(/tracked e-sign and signer routing are completed when you send/i);
    expect(html).not.toMatch(/Execution — Signatures/i);
  });

  it("cloneOwnerReadOnlyDraft isolates parties from display render inputs", () => {
    const corpus = paidProOwnerReadOnlyCorpus();
    const draft = paidProOwnerReadOnlyDraft(corpus);
    const cloned = cloneOwnerReadOnlyDraft(draft);
    cloned.parties![0].name = "Mutated Party Name";

    buildOwnerAgreementReadOnlyDisplayHtml({
      draft: cloned,
      corpus: {
        text: corpus,
        source: "authoritative_signing_snapshot",
        hash: "safety-fixture",
      },
    });

    expect(draft.parties![0].name).toBe(BLUE);
  });

  it("loadOwnerAgreementReadOnlyPreview performs read-only fetches and does not call draft persistence APIs", async () => {
    const corpus = paidProOwnerReadOnlyCorpus();
    const draft = {
      ...paidProOwnerReadOnlyDraft(corpus),
      server_full_document_text: corpus,
    } as AgreementDraft;
    const draftSnapshot = JSON.stringify(draft);
    const storedCorpusSnapshot = String(draft.server_full_document_text);

    const fetchDraft = vi.spyOn(agreementWorkspaceApi, "fetchAgreementDraft").mockResolvedValue({
      ok: true,
      draft,
    });
    const patchField = vi.spyOn(agreementWorkspaceApi, "patchAgreementField");
    const postReviewSent = vi.spyOn(agreementWorkspaceApi, "postReviewSentServer");
    const postDraftFromPrior = vi.spyOn(agreementWorkspaceApi, "postDraftFromPriorAgreement");
    const patchArchive = vi.spyOn(agreementWorkspaceApi, "patchWorkspaceArchive");
    const globalFetch = vi.spyOn(globalThis, "fetch");

    const loaded = await loadOwnerAgreementReadOnlyPreview("ag_owner_readonly_safety");

    expect(loaded).not.toBeNull();
    expect(fetchDraft).toHaveBeenCalledTimes(1);
    expect(patchField).not.toHaveBeenCalled();
    expect(postReviewSent).not.toHaveBeenCalled();
    expect(postDraftFromPrior).not.toHaveBeenCalled();
    expect(patchArchive).not.toHaveBeenCalled();
    expect(globalFetch).not.toHaveBeenCalled();

    expect(JSON.stringify(draft)).toBe(draftSnapshot);
    expect(String(draft.server_full_document_text)).toBe(storedCorpusSnapshot);
    expect(witnessCount(loaded!.corpusText)).toBe(1);
    expect(countPaidProExecutionBlocks(loaded!.corpusText)).toBe(1);
    expect(loaded!.html).toContain("<h1>MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT</h1>");
  });
});

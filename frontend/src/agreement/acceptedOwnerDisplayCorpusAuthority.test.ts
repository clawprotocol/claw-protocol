import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "./agreementTypes";
import { buildReviewFirstDocumentDisplayHtml } from "./reviewFirstDocumentDisplay";
import { extractVisiblePlainFromReviewHtml } from "./reviewFirstDocumentDisplayParity";
import { repairProtectedLegalEntitySuffixes } from "../components/agreements/paidProProtectedEntityRepair";

const PROVIDER = "Northwind Field Analytics Co";
const PROVIDER_STEM = "Northwind Field Analytics";
const CLIENT = "Cedar Ridge Services LLC";
const SNAPSHOT_ID = "crs_sanitized_display_authority";
const UNAUTHORIZED_SUFFIX = "Co ";

function sha256(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

function collapseWhitespace(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function acceptedCorpus(): string {
  const operative = [
    "SERVICES AGREEMENT",
    "",
    `This services agreement is between ${PROVIDER_STEM} and ${CLIENT}.`,
    `${PROVIDER_STEM} shall deliver the described services.`,
    "Fees are recorded as 5 < 10 units.",
    CLIENT + " shall pay the agreed fee.",
  ].join("\n");
  const filler =
    "The engagement covers planning, configuration, and knowledge transfer under ordinary commercial terms. ";
  let body = operative;
  while (body.length < 640) body += filler;
  body += [

    "",
    "IN WITNESS WHEREOF, the parties execute this agreement.",
    "",
    PROVIDER_STEM,
    "By: __________________________",
    "Name: Alex Quinn",
  ].join("\n");
  return body;
}

function draftWithAcceptedSnapshot(corpus: string): AgreementDraft {
  return {
    id: "agr_sanitized_display_authority",
    title: "Services agreement",
    jurisdiction: "Delaware",
    parties: [
      { id: "party_provider", name: PROVIDER, role: "Provider" },
      { id: "party_client", name: CLIENT, role: "Client" },
    ],
    purpose: corpus,
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    created_at: "2026-10-01T00:00:00.000Z",
    updated_at: "2026-10-01T00:00:00.000Z",
    versions: [],
    audit_log: [],
    accepted_review_snapshot_v1: {
      status: "accepted",
      snapshotId: SNAPSHOT_ID,
      corpusSha256: sha256(corpus),
      corpusLength: corpus.length,
      corpusPlain: corpus,
    },
  };
}

function articleInnerHtml(html: string): string {
  const signatureAt = html.search(/<section class="claw-premium-signature-section/);
  return signatureAt >= 0 ? html.slice(0, signatureAt) : html;
}

function normalizedArticle(html: string): string {
  return collapseWhitespace(extractVisiblePlainFromReviewHtml(articleInnerHtml(html)));
}

function insertedCodePoints(source: string, rendered: string): string {
  const left = collapseWhitespace(source);
  const right = rendered;
  let index = 0;
  const limit = Math.min(left.length, right.length);
  while (index < limit && left[index] === right[index]) index += 1;
  if (index >= right.length || left === right) return "";
  return right.slice(index, index + UNAUTHORIZED_SUFFIX.length);
}

describe("accepted owner display corpus authority", () => {
  it("preserves an accepted canonical corpus without suffix reconstruction", () => {
    const corpus = acceptedCorpus();
    const draft = draftWithAcceptedSnapshot(corpus);
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>unused</p>",
      corpusText: corpus,
      partyNames: [PROVIDER, CLIENT],
      draft,
      surface: "owner_done",
      selectedCorpusSource: "verified_server_canonical_review_snapshot",
      agreementId: draft.id,
    });
    const article = normalizedArticle(html);
    const accepted = collapseWhitespace(corpus);

    expect(article).toBe(accepted);
    expect(article.length).toBe(accepted.length);
    expect(sha256(article)).toBe(sha256(accepted));
    expect(insertedCodePoints(corpus, article)).toBe("");
    expect(article.includes(UNAUTHORIZED_SUFFIX)).toBe(false);
    expect(html).toContain("5 &lt; 10");
    expect(article).toContain("5 < 10");
    expect(draft.accepted_review_snapshot_v1?.snapshotId).toBe(SNAPSHOT_ID);
    expect(draft.accepted_review_snapshot_v1?.corpusSha256).toBe(sha256(corpus));
    expect(draft.accepted_review_snapshot_v1?.corpusLength).toBe(corpus.length);
    expect(draft.parties.map((party) => party.id)).toEqual(["party_provider", "party_client"]);

    const dom = new JSDOM(
      `<section data-testid="premium-agreement-readonly-article"><div class="premium-doc-body">${articleInnerHtml(html)}</div></section>`,
    );
    const body = dom.window.document.querySelector(".premium-doc-body");
    expect(body).not.toBeNull();
    const textNodes: string[] = [];
    const walker = dom.window.document.createTreeWalker(body as Node, dom.window.NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) textNodes.push(walker.currentNode.nodeValue ?? "");
    expect(textNodes.some((node) => node.includes(`${PROVIDER_STEM} Co`))).toBe(false);
    body?.querySelectorAll("br").forEach((br) => {
      br.replaceWith(dom.window.document.createTextNode("\n"));
    });
    const textContent = collapseWhitespace(body?.textContent ?? "");
    expect(textContent).toBe(accepted);
    expect(textContent.includes(UNAUTHORIZED_SUFFIX)).toBe(false);
  });

  it("still restores a missing entity suffix on pre-acceptance owner display", () => {
    const corpus = acceptedCorpus();
    const html = buildReviewFirstDocumentDisplayHtml({
      serverHtml: "<p>unused</p>",
      corpusText: corpus,
      partyNames: [PROVIDER, CLIENT],
      surface: "owner_done",
      selectedCorpusSource: "document_text",
      agreementId: "agr_sanitized_draft_display",
    });
    const article = normalizedArticle(html);
    expect(article).toContain(`${PROVIDER} shall deliver the described services.`);
    expect(article).not.toBe(collapseWhitespace(corpus));
    expect(insertedCodePoints(corpus, article)).toBe(UNAUTHORIZED_SUFFIX);
  });

  it("still restores a missing entity suffix through the draft repair function", () => {
    const corpus = `${PROVIDER_STEM} shall deliver the described services. ${CLIENT} shall pay the agreed fee.`;
    const repaired = repairProtectedLegalEntitySuffixes(corpus, [PROVIDER, CLIENT], corpus);
    expect(repaired.repairs).toBeGreaterThan(0);
    expect(repaired.text).toContain(`${PROVIDER} shall deliver the described services.`);
  });
});

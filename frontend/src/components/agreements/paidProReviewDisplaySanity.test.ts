import { afterEach, describe, expect, it } from "vitest";
import {
  detectProReviewDisplaySanityViolations,
  sanitizeProReviewDisplayText,
} from "./polishProAgreementDisplayLayer";
import {
  establishPaidProSourceOfTruth,
  clearPaidProSourceOfTruth,
  hashPaidProCorpus,
} from "./paidProSourceOfTruth";
import { resolvePaidProReviewRenderPlain } from "./paidProReviewRenderCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const structured: ParsedDraftShape = {
  title: "Mutual Consulting and Implementation Agreement",
  jurisdiction: "Delaware",
  parties: [
    { name: "Blue Canyon Analytics LLC", role: "Client" },
    { name: "Iron Vale Systems Inc.", role: "Service Provider" },
  ],
  purpose: "AI workflow implementation services.",
  payment_terms: "$8,500 fixed fee.",
  duration: "12 months",
  due_date: null,
  effective_date: "As agreed",
  payment: { amount: 8500, cadence: null, valid: true },
  agreement_family: "services_agreement",
};

function validPostSotExecutionCorpus(): string {
  return [
    "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
    "",
    'This Agreement is between Blue Canyon Analytics LLC ("Client") and Iron Vale Systems Inc. ("Service Provider").',
    "",
    ...Array.from({ length: 12 }, (_, i) => `${i + 1}. Operative clause ${i + 1} with substantive detail.`),
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    "CLIENT:",
    "Blue Canyon Analytics LLC",
    "By: __________________________",
    "Name: __________________________",
    "Title: _________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
    "",
    "SERVICE PROVIDER:",
    "Iron Vale Systems Inc.",
    "By: __________________________",
    "Name: __________________________",
    "Title: _________________________",
    "Email for Notice: __________________________",
    "Address for Notice: ________________________",
    "Date: _____________________________",
  ].join("\n");
}

describe("paidProReviewDisplaySanity", () => {
  afterEach(() => {
    clearPaidProSourceOfTruth();
  });

  it("valid post-SoT execution block does not trigger display sanity violations", () => {
    const corpus = validPostSotExecutionCorpus();
    expect(detectProReviewDisplaySanityViolations(corpus)).toEqual([]);
    const { sanityBlocked } = sanitizeProReviewDisplayText(corpus, {
      source: "test_valid_post_sot",
    });
    expect(sanityBlocked).toBe(false);
  });

  it("duplicate witness still blocks display sanity", () => {
    const corpus = [
      validPostSotExecutionCorpus(),
      "",
      "IN WITNESS WHEREOF, duplicate execution tail.",
      "By: __________________________",
    ].join("\n");
    expect(detectProReviewDisplaySanityViolations(corpus)).toContain("witness");
  });

  it("execution By/Name/Title/Date before witness still blocks", () => {
    const corpus = [
      "AGREEMENT",
      "",
      "1. Scope. Services.",
      "By: __________________________",
      "Name: __________________________",
      "Title: _________________________",
      "Date: _____________________________",
      "",
      "IN WITNESS WHEREOF, the Parties execute this Agreement.",
      "",
      "CLIENT:",
      "Blue Canyon Analytics LLC",
      "By: __________________________",
    ].join("\n");
    const violations = detectProReviewDisplaySanityViolations(corpus);
    expect(violations).toContain("execution_by_line");
    expect(violations).toContain("execution_name_line");
  });

  it("Party Notice Details and Party 1 pre-witness summary still block", () => {
    const witnessAt = validPostSotExecutionCorpus().indexOf("IN WITNESS WHEREOF");
    const corpus = [
      validPostSotExecutionCorpus().slice(0, witnessAt).trimEnd(),
      "",
      "Party Notice Details:",
      "",
      "Client:",
      "Blue Canyon Analytics LLC",
      "Signer: Anthem H Blanchard",
      "Email: anthem@test.com",
      "",
      "Party 1:",
      "Blue Canyon Analytics LLC",
      "",
      validPostSotExecutionCorpus().slice(witnessAt),
    ].join("\n");
    const violations = detectProReviewDisplaySanityViolations(corpus);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations).toContain("witness");
  });

  it("server_full_draft SoT display remains hash-stable after review render resolve", () => {
    const intake =
      "Services between Blue Canyon Analytics LLC and Iron Vale Systems Inc for AI workflow implementation $8500 Delaware";
    let body = [
      "MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT",
      "",
      "Blue Canyon Analytics LLC (Client) and Iron Vale Systems Inc. (Service Provider).",
      "Delaware law. Fixed fee $8,500.",
      "",
      ...Array.from({ length: 8 }, (_, i) => `${i + 1}. Operative clause ${i + 1}.`),
      "",
      "IN WITNESS WHEREOF",
      "CLIENT: Blue Canyon Analytics LLC",
      "SERVICE PROVIDER: Iron Vale Systems Inc.",
    ].join("\n");
    while (body.length < 6_500) {
      body += "\n9. Additional operative clause for acceptance gates.";
    }
    const record = establishPaidProSourceOfTruth({
      text: body,
      source: "server_full_draft",
      draft: structured,
      intakeText: intake,
    });
    const render = resolvePaidProReviewRenderPlain({ draft: structured, intakeText: intake });
    expect(hashPaidProCorpus(render)).toBe(record.hash);
    expect(detectProReviewDisplaySanityViolations(render)).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import { resolvePremiumRenderSource } from "./premiumRenderSourceResolver";

const emptyPayment = { amount: null as number | null, cadence: null as string | null, valid: true };

function baseDraft(over: Partial<ParsedDraftShape> = {}): ParsedDraftShape {
  return {
    title: "Consulting Agreement",
    jurisdiction: "Delaware",
    parties: [
      { name: "A LLC", role: "party" },
      { name: "B LLC", role: "party" },
    ],
    purpose: "Marketing advisory with commission and exclusivity in the northeast territory.",
    payment_terms: "10% commission with 90-day clawback; reimbursable travel.",
    duration: "12 months",
    due_date: null,
    effective_date: null,
    payment: emptyPayment,
    agreement_family: "consulting_agreement",
    ...over,
  };
}

function longValidServerDoc(): string {
  const body = "Operative paragraph. ".repeat(220);
  return [
    "WHEREAS the parties wish to document consulting services.\n",
    "1. SCOPE. Provider delivers marketing advisory and partner enablement.\n",
    "2. FEES. Commission 10% with clawback on refunded deals; reimbursable expenses.\n",
    "3. CONFIDENTIALITY. Mutual protection of non-public information.\n",
    "4. TERM. Twelve months unless terminated as stated.\n",
    "5. INDEMNITY. Commercially customary indemnity.\n",
    "6. LIMITATION OF LIABILITY. Except gross negligence.\n",
    "7. DISPUTES. Negotiation then courts of Delaware.\n",
    "8. NOTICES. Email to designated representatives.\n",
    "9. MISCELLANEOUS. Entire agreement; electronic signatures.\n",
    "10. GOVERNING LAW. Delaware.\n\n",
    body,
  ].join("");
}

function mediumStrictServerDoc(): string {
  const body = "Operative clause language with concrete obligations, fees, and signatures. ".repeat(24);
  return [
    "Logo Design Agreement\n",
    "1. Scope of Services. Designer creates logo package and source files.\n",
    "2. Fees and Payment. Flat $1,500 with two revision rounds included.\n",
    "3. Ownership and IP. Client owns final approved logo assets.\n",
    "4. Confidentiality and Notices. Parties protect non-public project data.\n",
    "5. Termination and Disputes. Material breach cure period and venue.\n\n",
    body,
  ].join("");
}

function compactStrictServerDoc(): string {
  return [
    "Founder Vesting Agreement\n",
    "1. Equity Split and Vesting. Founders hold 60/40 subject to four-year vesting and one-year cliff.\n",
    "2. IP Assignment and Confidentiality. Company owns work product; founders assign inventions.\n",
    "3. Termination and Repurchase. Unvested shares repurchased at cost; disputes under Delaware law.\n\n",
    "Additional operative clauses covering representations, notices, and signature mechanics. ".repeat(14),
  ].join("");
}

describe("resolvePremiumRenderSource", () => {
  it("prefers structurally valid server full over repair and live", () => {
    const full = longValidServerDoc();
    const repair = full.replace("10%", "12%");
    const d = baseDraft({
      premium_server_full_document_text: full,
      premium_server_repair_document_text: repair,
    });
    const r = resolvePremiumRenderSource({
      draft: d,
      intakeText: "commission 10% consulting northeast",
      buildLivePreview: () => "LIVE_SHOULD_NOT_WIN",
    });
    expect(r.premium_render_source).toBe("server_full_document_text");
    expect(r.text).toContain("10%");
  });

  it("uses repair when primary fails structural validation", () => {
    const badPrimary = "Your LawDog Pro agreement is structured below\n" + "x".repeat(200);
    const repair = longValidServerDoc();
    const d = baseDraft({
      premium_server_full_document_text: badPrimary,
      premium_server_repair_document_text: repair,
    });
    const r = resolvePremiumRenderSource({
      draft: d,
      intakeText: "commission consulting advisory",
      buildLivePreview: () => "LIVE",
    });
    expect(r.premium_render_source).toBe("server_repair_document_text");
  });

  it("keeps strict known-intent server corpus over live when server is medium-length but structured", () => {
    const server = mediumStrictServerDoc();
    const d = baseDraft({
      title: "Design Services Agreement",
      premium_server_full_document_text: server,
    });
    const r = resolvePremiumRenderSource({
      draft: d,
      intakeText: "Need a logo contract for $1,500 with 2 revisions",
      buildLivePreview: () => "LIVE_DRAFT_SHOULD_NOT_WIN",
    });
    expect(r.premium_render_source).toBe("server_full_document_text");
    expect(r.text).toContain("Logo Design Agreement");
  });

  it("still rejects too-thin strict server corpora", () => {
    const tooThin = "Founder Vesting Agreement\n1. Vesting applies.\n2. Equity split.\n";
    const d = baseDraft({
      title: "Founder Vesting Agreement",
      premium_server_full_document_text: tooThin,
    });
    const r = resolvePremiumRenderSource({
      draft: d,
      intakeText: "Two founders 60/40 vesting",
      buildLivePreview: () => "fallback live text with structure ".repeat(20),
    });
    expect(r.premium_render_source).not.toBe("server_full_document_text");
  });

  it("accepts compact but structured strict founder server corpus over live fallback", () => {
    const server = compactStrictServerDoc();
    const d = baseDraft({
      title: "Founder Vesting Agreement",
      premium_server_full_document_text: server,
    });
    const r = resolvePremiumRenderSource({
      draft: d,
      intakeText: "Two founders 60/40 vesting with one-year cliff",
      buildLivePreview: () => "LIVE_SHOULD_NOT_WIN",
    });
    expect(r.premium_render_source).toBe("server_full_document_text");
    expect(r.text).toContain("Founder Vesting Agreement");
  });
});

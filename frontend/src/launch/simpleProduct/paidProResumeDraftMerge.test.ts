import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import { mergePaidProAuthoritativeDraftFieldsFromApi } from "./paidProResumeDraftMerge";

describe("mergePaidProAuthoritativeDraftFieldsFromApi", () => {
  it("copies authoritative corpus and party contacts from API draft onto coerced shape", () => {
    const corpus = "z".repeat(600);
    const apiDraft = {
      title: "T",
      jurisdiction: "DE",
      parties: [
        { id: "p1", name: "Alice", role: "owner", email: "alice@example.com", phone: "+15551212" },
        { id: "p2", name: "Bob", role: "reviewer", email: "bob@example.com", phone: "" },
      ],
      purpose: "Scope",
      payment_terms: "Net 30",
      premium_render_source: "server_full_document_text",
      server_full_document_text: corpus,
      premium_full_document_text: "",
      premium_server_full_document_text: "",
    } as AgreementDraft;

    const coerced: ParsedDraftShape = {
      title: "T",
      jurisdiction: "DE",
      parties: [
        { name: "Alice", role: "owner" },
        { name: "Bob", role: "reviewer" },
      ],
      purpose: "Scope",
      payment_terms: "Net 30",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };

    const merged = mergePaidProAuthoritativeDraftFieldsFromApi(coerced, apiDraft) as ParsedDraftShape & {
      server_full_document_text?: string;
      premium_render_source?: string;
    };
    expect(String(merged.server_full_document_text ?? "").length).toBeGreaterThanOrEqual(600);
    expect(merged.premium_render_source).toBe("server_full_document_text");
    const p0 = merged.parties[0] as { email?: string; id?: string };
    const p1 = merged.parties[1] as { email?: string; id?: string };
    expect(p0.email).toBe("alice@example.com");
    expect(p0.id).toBe("p1");
    expect(p1.email).toBe("bob@example.com");
    expect(p1.id).toBe("p2");
  });

  it("is a no-op when api draft is null", () => {
    const coerced: ParsedDraftShape = {
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "A", role: "owner" }],
      purpose: "S",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    expect(mergePaidProAuthoritativeDraftFieldsFromApi(coerced, null)).toBe(coerced);
  });
});

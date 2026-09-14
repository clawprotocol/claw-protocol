import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import {
  mergePaidProAuthoritativeDraftFieldsFromApi,
  retainAuthorizedApiPartiesAfterIntakeDefaults,
} from "./paidProResumeDraftMerge";

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

  it("restores GET counterparties dropped by intake defaults on a short shell", () => {
    const afterDefaults: ParsedDraftShape = {
      title: "Consulting Services Agreement",
      jurisdiction: "DE",
      parties: [{ name: "Harbor Peak Analytics LLC", role: "Client" }],
      purpose: "Short GET shell",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const apiDraft = {
      parties: [
        {
          id: "63488645-6996-49fb-84f3-888cf0ec9993",
          name: "Harbor Peak Analytics LLC",
          role: "owner",
          email: "maya.chen@harborpeak.test",
        },
        {
          id: "8f01efd1-e0fb-472d-b9cd-95c87607965c",
          name: "Ironvale Manufacturing Inc.",
          role: "reviewer",
          email: "jordan.hale@ironvale.test",
        },
      ],
    } as AgreementDraft;
    const retained = retainAuthorizedApiPartiesAfterIntakeDefaults(afterDefaults, apiDraft);
    expect(retained.parties).toHaveLength(2);
    expect(retained.parties[1]).toMatchObject({
      id: "8f01efd1-e0fb-472d-b9cd-95c87607965c",
      name: "Ironvale Manufacturing Inc.",
      email: "jordan.hale@ironvale.test",
      role: "reviewer",
    });
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

import { normalizeAgreementDraftFromApi } from "../../agreement/agreementDraftNormalize";

describe("phase4b51 GET draft normalize", () => {
  it("keeps server paper on the fixture payload", () => {
    const paper = `${"PHASE4B51 PAID ORION SAAS AGREEMENT\n"}${"x".repeat(600)}`;
    const draft = normalizeAgreementDraftFromApi(
      {
        id: "ag-phase4b51-create",
        title: "PHASE4B51 PAID ORION SAAS AGREEMENT",
        jurisdiction: "New York",
        parties: [
          { name: "Orion Harbor LLC", role: "Provider" },
          { name: "Northwind Retail Inc", role: "Customer" },
        ],
        purpose: "Hosted SaaS subscription.",
        payment_terms: "$180,000 annual",
        duration: "12 months",
        document_text: paper,
        server_full_document_text: paper,
        premium_full_document_text: paper,
        premium_render_source: "server_full_document_text",
        created_at: "2026-09-01T00:00:00.000Z",
        updated_at: "2026-09-01T00:00:00.000Z",
        versions: [{ version: 1, created_at: "2026-09-01T00:00:00.000Z" }],
        audit_log: [],
      },
      { fallbackAgreementId: "ag-phase4b51-create", partyNameContext: "Party" },
    );
    expect(draft).not.toBeNull();
    expect(String(draft?.server_full_document_text || "").length).toBeGreaterThanOrEqual(500);
  });
});

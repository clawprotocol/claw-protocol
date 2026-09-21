import { describe, expect, it } from "vitest";
import type { AgreementDraft } from "../../agreement/agreementTypes";
import type { ParsedDraftShape } from "../../components/agreements/intakeSmartDefaults";
import {
  liveSignerUiFieldsFromDraftParties,
  mergePaidProAuthoritativeDraftFieldsFromApi,
  retainAuthorizedApiPartiesAfterIntakeDefaults,
  shouldKeepPersistedApiPartiesOnResume,
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

  it("restores owner_delivery_track and snake_case signer_name from GET", () => {
    const apiDraft = {
      id: "agr-resume",
      parties: [
        {
          id: "p1",
          name: "Harbor Peak Analytics LLC",
          role: "Consultant",
          signer_name: "Pat Harbor",
          email: "pat.harbor@harbor.test",
        },
      ],
      owner_delivery_track: "signature",
    } as AgreementDraft;
    const coerced: ParsedDraftShape = {
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "Harbor Peak Analytics LLC", role: "Consultant" }],
      purpose: "Scope",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const merged = mergePaidProAuthoritativeDraftFieldsFromApi(coerced, apiDraft);
    expect(merged.owner_delivery_track).toBe("signature");
    expect((merged.parties[0] as { signerName?: string }).signerName).toBe("Pat Harbor");
  });

  it("does not default a missing or unknown delivery track to signature", () => {
    const coerced: ParsedDraftShape = {
      title: "T",
      jurisdiction: "DE",
      parties: [{ name: "Harbor Peak Analytics LLC", role: "Consultant" }],
      purpose: "Scope",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const missingDraft = normalizeAgreementDraftFromApi({ id: "agr-missing-track" });
    const unknownDraft = normalizeAgreementDraftFromApi({
      id: "agr-unknown-track",
      owner_delivery_track: "send",
    });
    const missing = mergePaidProAuthoritativeDraftFieldsFromApi(coerced, missingDraft);
    const unknown = mergePaidProAuthoritativeDraftFieldsFromApi(coerced, unknownDraft);
    expect(missing.owner_delivery_track ?? null).toBeNull();
    expect(unknown.owner_delivery_track ?? null).toBeNull();
  });

  it("copies persisted signer names onto coerced parties and keeps them after intake defaults", () => {
    const apiDraft = {
      parties: [
        {
          id: "p1",
          name: "Lumen Bioinformatics Inc.",
          role: "Platform Developer",
          email: "elena.vasquez@lumenbio.com",
          signerName: "Dr. Elena Vasquez",
          signerTitle: "CSO",
        },
        {
          id: "p2",
          name: "Thalassa Data Systems LLC",
          role: "Data Infrastructure Provider",
          email: "marcus.webb@thalassadata.com",
          signerName: "Marcus Webb",
        },
        {
          id: "p3",
          name: "Coastal Meridian Analytics LLC",
          role: "Analytics Integrator",
          email: "priya.nair@coastalmeridian.com",
          signerName: "Priya Nair",
        },
        {
          id: "p4",
          name: "Vanguard Regulatory Sciences Ltd.",
          role: "Regulatory Compliance Advisor",
          email: "james.osullivan@vanguardregulatory.co",
          signerName: "James O'Sullivan",
        },
      ],
    } as AgreementDraft;
    const coerced: ParsedDraftShape = {
      title: "T",
      jurisdiction: "MA",
      parties: apiDraft.parties.map((party) => ({ name: party.name, role: party.role })),
      purpose: "Scope",
      payment_terms: "",
      duration: null,
      due_date: null,
      effective_date: null,
      payment: { amount: null, cadence: null, valid: false },
    };
    const merged = mergePaidProAuthoritativeDraftFieldsFromApi(coerced, apiDraft);
    expect(merged.parties.map((party) => (party as { signerName?: string }).signerName)).toEqual([
      "Dr. Elena Vasquez",
      "Marcus Webb",
      "Priya Nair",
      "James O'Sullivan",
    ]);
    const retained = retainAuthorizedApiPartiesAfterIntakeDefaults(
      {
        ...merged,
        parties: merged.parties.map((party) => ({ name: party.name, role: party.role })),
      },
      apiDraft,
    );
    expect(retained.parties[3]).toMatchObject({
      name: "Vanguard Regulatory Sciences Ltd.",
      email: "james.osullivan@vanguardregulatory.co",
      signerName: "James O'Sullivan",
    });
    expect(
      shouldKeepPersistedApiPartiesOnResume({ signerSetupResume: false, apiParties: apiDraft.parties }),
    ).toBe(true);
    expect(
      shouldKeepPersistedApiPartiesOnResume({
        signerSetupResume: false,
        apiParties: [
          { name: "Harbor Peak Analytics LLC" },
          { name: "Ironvale Manufacturing Inc." },
        ],
      }),
    ).toBe(false);
    expect(liveSignerUiFieldsFromDraftParties(apiDraft.parties).names[3]).toBe("James O'Sullivan");
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

  it("normalizes persisted owner_delivery_track and drops unknown values", () => {
    const signed = normalizeAgreementDraftFromApi({
      id: "ag-track-signature",
      owner_delivery_track: "SIGNATURE",
    });
    expect(signed?.owner_delivery_track).toBe("signature");
    const review = normalizeAgreementDraftFromApi({
      id: "ag-track-review",
      owner_delivery_track: "review",
    });
    expect(review?.owner_delivery_track).toBe("review");
    const unknown = normalizeAgreementDraftFromApi({
      id: "ag-track-unknown",
      owner_delivery_track: "send",
    });
    expect(unknown?.owner_delivery_track).toBeNull();
    const missing = normalizeAgreementDraftFromApi({ id: "ag-track-missing" });
    expect(missing?.owner_delivery_track).toBeNull();
  });
});

/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import {
  applyPaidProDocumentBoundaryAuthority,
  assertPaidProDocumentBoundaryAuthorityForFreeze,
  detectDocumentBoundaryViolations,
} from "./paidProDocumentBoundaryAuthority";
import {
  containsUnresolvedRenderTokens,
  scanUnresolvedRenderTokens,
} from "./userVisibleRenderTokenAuthority";
import {
  clearConsumedPaidProSignerMetadataAuthority,
  setConsumedPaidProSignerMetadataAuthority,
  type PaidProSignerMetadataParty,
} from "./paidProSignerMetadataAuthority";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

// ── Authoritative 4-party metadata (the source of truth for notice contacts) ──
const PARTIES = [
  {
    legal: "Aurora Grid Systems LLC",
    role: "Client",
    signer: "Sarah Mitchell",
    title: "CEO",
    email: "contracts@auroragrid.com",
    address: "100 Commerce Way, Tulsa, OK 74103",
  },
  {
    legal: "Basalt Freight Partners LLC",
    role: "Service Provider",
    signer: "Michael Torres",
    title: "President",
    email: "legal@basaltfreight.com",
    address: "250 Innovation Drive, Austin, TX 78701",
  },
  {
    legal: "Cedar Point Analytics Inc",
    role: "Advisor",
    signer: "Dana Whitfield",
    title: "Managing Director",
    email: "ops@cedarpointanalytics.com",
    address: "88 Lakeshore Blvd, Chicago, IL 60601",
  },
  {
    legal: "Delta Harbor Robotics LLC",
    role: "Integrator",
    signer: "Priya Nair",
    title: "COO",
    email: "notices@deltaharborrobotics.com",
    address: "17 Seaport Lane, Boston, MA 02210",
  },
] as const;

const INTAKE = [
  `Create a professional services agreement between ${PARTIES[0].legal}, ${PARTIES[1].legal}, ${PARTIES[2].legal}, and ${PARTIES[3].legal}.`,
  ...PARTIES.map(
    (p) => `${p.legal}: ${p.signer}, ${p.title}, ${p.email}, ${p.address}`,
  ),
  "Texas law.",
].join("\n");

function fourPartyDraft(): ParsedDraftShape {
  return {
    title: "Professional Services Agreement",
    jurisdiction: "Texas",
    agreement_family: "services_agreement",
    parties: PARTIES.map((p) => ({
      name: p.legal,
      role: p.role,
      email: p.email,
      partyAddress: p.address,
    })) as never,
    purpose: "Multi-party platform integration, analytics, and logistics services.",
    payment_terms: "Milestone-based fees.",
    duration: "24 months",
    due_date: null,
    effective_date: null,
    payment: { amount: 120000, cadence: "monthly", valid: true },
  };
}

function fourPartyAuthorityParties(): PaidProSignerMetadataParty[] {
  return PARTIES.map((p, i) => ({
    partyIndex: i,
    partyLegalName: p.legal,
    signerEmail: p.email,
    signerName: p.signer,
    signerTitle: p.title,
    partyAddress: p.address,
  }));
}

// Substantive server corpus with malformed / collapsed inline Notices AND leaked render tokens
// ([EMAIL_N], [Address], {{...}}, PARTY A). This mirrors the live TEST546 43k server corpus that was
// rejected into the blank 2853 retry shell.
function buildTest546FourPartyServerCorpus(): string {
  const clauseBody =
    "The Parties shall perform their respective obligations in a professional and workmanlike manner consistent with prevailing industry standards, applicable law, and the reasonable written instructions of the other Parties, it being understood that time is of the essence with respect to each material milestone and that no waiver shall be effective unless made in a signed writing.";
  const clauses = [
    "Services and Deliverables",
    "Compensation and Invoicing",
    "Term and Termination",
    "Confidentiality",
    "Intellectual Property",
    "Representations and Warranties",
    "Limitation of Liability",
    "Indemnification",
    "Insurance and Compliance",
    "General Provisions",
  ]
    .map((topic, i) => `${i + 1}. ${topic}. ${clauseBody} ${clauseBody}`)
    .join("\n\n");

  return [
    "PROFESSIONAL SERVICES AGREEMENT",
    "",
    `This Agreement is entered into by and among PARTY A ("Client"), ${PARTIES[1].legal} ("Service Provider"), ${PARTIES[2].legal} ("Advisor"), and ${PARTIES[3].legal} ("Integrator").`,
    "",
    clauses,
    "",
    "11. Notices",
    // Collapsed / malformed inline notice stanzas with leaked contact render tokens.
    `If to ${PARTIES[0].legal} : ${PARTIES[0].legal} Attn: [SIGNER_NAME] Email: [EMAIL_1] Address: [Address] If to ${PARTIES[1].legal} : ${PARTIES[1].legal} Email: [EMAIL_2] If to ${PARTIES[2].legal} : {{party_3_contact}} If to ${PARTIES[3].legal} :`,
    "",
    "12. GOVERNING LAW",
    "This Agreement is governed by the laws of the State of Texas.",
    "",
    "IN WITNESS WHEREOF, the Parties execute this Agreement.",
    "",
    `CLIENT: ${PARTIES[0].legal}`,
    "By: _________________________________",
    `Name: ${PARTIES[0].signer}`,
    `Title: ${PARTIES[0].title}`,
    "",
    `SERVICE PROVIDER: ${PARTIES[1].legal}`,
    "By: _________________________________",
    `Name: ${PARTIES[1].signer}`,
    `Title: ${PARTIES[1].title}`,
    "",
    `ADVISOR: ${PARTIES[2].legal}`,
    "By: _________________________________",
    `Name: ${PARTIES[2].signer}`,
    `Title: ${PARTIES[2].title}`,
    "",
    `INTEGRATOR: ${PARTIES[3].legal}`,
    "By: _________________________________",
    `Name: ${PARTIES[3].signer}`,
    `Title: ${PARTIES[3].title}`,
  ].join("\n");
}

afterEach(() => {
  clearConsumedPaidProSignerMetadataAuthority();
});

describe("TEST546 — substantive 4-party paid Pro corpus with notice placeholders repairs cleanly", () => {
  it("repairs malformed notice/contact tokens using authority metadata and does not reject into the thin shell", () => {
    setConsumedPaidProSignerMetadataAuthority({
      parties: fourPartyAuthorityParties(),
      source: "live_ui",
      hash: "x",
      updatedAt: 0,
    });

    const raw = buildTest546FourPartyServerCorpus();
    const result = applyPaidProDocumentBoundaryAuthority(raw, {
      draft: fourPartyDraft(),
      intakeText: INTAKE,
    });
    const repaired = result.text;

    // 1. contact.ok === true (result.ok folds in contact resolution) and boundary is clean.
    expect(result.ok).toBe(true);
    expect(detectDocumentBoundaryViolations(repaired)).toEqual([]);

    // 2. Exactly 4 structured notice stanzas, one per authoritative party.
    const stanzaCount = (repaired.match(/^If to\s+/gim) ?? []).length;
    expect(stanzaCount).toBe(4);
    for (const p of PARTIES) {
      expect(repaired).toContain(`If to ${p.legal}:`);
      expect(repaired).toContain(`Email: ${p.email}`);
    }

    // 3. No leaked render tokens remain.
    expect(repaired).not.toMatch(/\[\s*EMAIL_\d+\s*\]/i);
    expect(repaired).not.toMatch(/\[\s*(?:Address|SIGNER_NAME|PARTY_ADDRESS)\s*\]/i);
    expect(repaired).not.toMatch(/\{\{[^}]+\}\}/);
    expect(repaired).not.toMatch(/\bPARTY\s+[AB]\b/);
    expect(repaired).not.toMatch(/\bParty\s+\d+\b/);
    expect(containsUnresolvedRenderTokens(repaired)).toBe(false);
    expect(scanUnresolvedRenderTokens(repaired).map((m) => m.token)).toEqual([]);

    // 4. Freeze gate accepts the repaired substantive corpus (no fall-through to blank retry shell).
    expect(() =>
      assertPaidProDocumentBoundaryAuthorityForFreeze(raw, {
        draft: fourPartyDraft(),
        intakeText: INTAKE,
        parties: fourPartyAuthorityParties(),
        draftPartyCount: 4,
        handoffPartySlots: 4,
        surface: "test546_four_party_freeze",
      }),
    ).not.toThrow();
  });
});

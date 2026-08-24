/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearCanonicalPartyMetadata } from "./canonicalPartyMetadataAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resetSignerCountAuthorityDiagnosticsForTests } from "./signerCountAuthority";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import { hydrateCanonicalPartyMetadataAfterCheckoutRestore } from "./paidProCheckoutRestoreMetadataHydrate";
import {
  clearCheckoutBackRestoreSnapshot,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
  repairCheckoutBackRestoreDraftParties,
} from "./checkoutBackRestore";
import { resolvePartiesForReviewRender } from "./paidProReviewRenderParties";
import { setPaidProReviewSignerMetadataSessionActive } from "./paidProReviewRenderSessionGate";
import { applyPaidProReviewRenderSanitizer } from "./paidProReviewRenderCorpus";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC for a logo and brand kit, 2400 dollars due on signing, 30 days starting August 24 2026, Texas law.";

const PRE_CHECKOUT_DRAFT: ParsedDraftShape = {
  title: "SERVICES AGREEMENT",
  jurisdiction: "Texas",
  parties: [
    { name: "Priya Shah of Northline Studio", role: "client" },
    { name: "Diego Alvarez of Harbor Marks LLC", role: "service_provider" },
  ],
  purpose: "design a logo and brand kit",
  payment_terms: "$2,400 due on signing",
  duration: "30 days starting August 24, 2026",
};

const POST_GENERATION_CORRUPTED_DRAFT: ParsedDraftShape = {
  ...PRE_CHECKOUT_DRAFT,
  parties: [
    { name: "Harbor Marks LLC", role: "client" },
    { name: "Diego Alvarez of", role: "service_provider" },
  ],
};

const SCOPE_CONTAMINATED_DRAFT: ParsedDraftShape = {
  ...PRE_CHECKOUT_DRAFT,
  parties: [
    { name: "Priya Shah of Northline Studio", role: "client" },
    {
      name: "Diego Alvarez of Harbor Marks LLC to design a logo and brand kit",
      role: "service_provider",
    },
  ],
};

const CONTAMINATED_OPENING = [
  "SERVICES AGREEMENT",
  "",
  'This Agreement is between Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC to design a logo and brand kit ("Service Provider").',
  "",
  "1. SERVICES",
  "The Service Provider will design a logo and brand kit for the Client.",
  "",
  ...Array.from(
    { length: 24 },
    (_, index) =>
      `${index + 2}. Commercial clause ${index + 2}. The Parties will perform the stated obligations in good faith under Texas law.`,
  ),
  "",
  "IN WITNESS WHEREOF, the Parties execute this Agreement.",
  "",
  "CLIENT:",
  "Priya Shah of Northline Studio",
  "By: __________________________",
  "Name: Priya Shah",
  "",
  "SERVICE PROVIDER:",
  "Diego Alvarez of Harbor Marks LLC to design a logo and brand kit",
  "By: __________________________",
  "Name: Diego Alvarez",
].join("\n");

describe("paidPro bilateral checkout restore regression", () => {
  beforeEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignerCountAuthorityDiagnosticsForTests();
    clearCheckoutBackRestoreSnapshot();
  });

  afterEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignerCountAuthorityDiagnosticsForTests();
    clearCheckoutBackRestoreSnapshot();
  });

  it("pre-checkout snapshot → post-payment repair keeps Priya client / Diego provider", () => {
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE,
      draft: PRE_CHECKOUT_DRAFT,
    });
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.draft.parties.map((p) => p.name)).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);

    const restoredDraft = repairCheckoutBackRestoreDraftParties(
      POST_GENERATION_CORRUPTED_DRAFT,
      snap!.intakeText,
    );
    expect(restoredDraft.parties.map((p) => p.name)).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);

    const legalEntities = resolveLegalEntitiesForCanonicalMetadata({
      intakeText: INTAKE,
      draft: restoredDraft,
    });
    expect(legalEntities).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);

    const hydrated = hydrateCanonicalPartyMetadataAfterCheckoutRestore({
      intakeText: INTAKE,
      draft: SCOPE_CONTAMINATED_DRAFT,
    });
    expect(hydrated.fieldCounts.entityCount).toBe(2);

    setPaidProReviewSignerMetadataSessionActive(true);
    const reviewParties = resolvePartiesForReviewRender({
      intakeText: INTAKE,
      draft: SCOPE_CONTAMINATED_DRAFT,
      liveSignerMetadataUi: {
        partyCount: 2,
        recipient1Name: "Priya Shah of Northline Studio",
        recipient2Name: "Diego Alvarez of Harbor Marks LLC",
        recipient1Email: "priya.shah.qa@example.com",
        recipient2Email: "diego.alvarez.qa@example.com",
        extraPartyReviewEmails: [],
        partySignerNames: ["Priya Shah", "Diego Alvarez"],
        partySignerTitles: ["", ""],
        partyAddresses: ["", ""],
      },
    });
    expect(reviewParties.map((party) => party.partyLegalName)).toEqual([
      "Priya Shah of Northline Studio",
      "Diego Alvarez of Harbor Marks LLC",
    ]);
    expect(reviewParties.map((party) => party.signerEmail)).toEqual([
      "priya.shah.qa@example.com",
      "diego.alvarez.qa@example.com",
    ]);

    const sanitized = applyPaidProReviewRenderSanitizer(CONTAMINATED_OPENING, reviewParties, {
      intakeText: INTAKE,
      draftPartyNames: restoredDraft.parties.map((p) => String(p.name ?? "")),
    }).text;
    expect(sanitized).toContain(
      'Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC ("Service Provider")',
    );
    expect(sanitized).toMatch(/SERVICE PROVIDER:\s*\nDiego Alvarez of Harbor Marks LLC\s*\nBy:/i);
    expect(sanitized).not.toMatch(
      /Diego Alvarez of Harbor Marks LLC to design a logo and brand kit \("Service Provider"\)/,
    );
    expect(sanitized).not.toMatch(
      /SERVICE PROVIDER:\s*\nDiego Alvarez of Harbor Marks LLC to design a logo and brand kit/i,
    );
  });
});

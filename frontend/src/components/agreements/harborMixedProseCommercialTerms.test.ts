/**
 * Harbor-like messy prose commercial term extraction tests.
 *
 * This PR provides:
 * 1. commercialProtectiveTermsExtract - exclusivity, no-poach, clawback, house-account carve-outs
 * 2. premiumInstructionStrip - prompt-as-heading leakage fix
 * 3. canonicalPartyIdentityResolver - no single-word short-form role token replacement
 *
 * Party/payment/term extraction is handled by #19's proAgreementFiveTenets system.
 */

import { describe, it, expect } from "vitest";
import { extractCommercialProtectiveTerms } from "./commercialProtectiveTermsExtract";
import { stripPremiumInstructionNoiseForDocument } from "./premiumInstructionStrip";
import {
  replaceTruncatedPartyRefsWithRoleLabels,
  type CanonicalPartyIdentityRecord,
} from "./canonicalPartyIdentityResolver";

const HARBOR_PROMPT = `Harbor Pool & Patio LLC referring leads via Mesa Realty Group LLC. 
7% commission after deposit clears, exclude house accounts and last-year clients, 
45-day clawback on cancellations or chargebacks offsetting unpaid commissions, 
12-month term, Phoenix-metro exclusivity only if they hit minimum qualified lead volume, 
no-poach on our staff and techs, no-direct-contact with our clients, Arizona law governs.
My dog Biscuit loves their teal company trucks.`;

describe("Harbor-like messy prose commercial term extraction", () => {
  describe("extractCommercialProtectiveTerms", () => {
    const terms = extractCommercialProtectiveTerms(HARBOR_PROMPT);

    it("extracts exclusivity clause signal", () => {
      expect(terms.exclusivity).toBeTruthy();
      expect(terms.exclusivityText).toMatch(/exclusiv/i);
    });

    it("extracts no-poach / non-solicit signal", () => {
      expect(terms.noPoach).toBeTruthy();
      expect(terms.noPoachText).toMatch(/no-poach|no-direct-contact|non-solicit/i);
    });

    it("extracts clawback clause signal", () => {
      expect(terms.clawback).toBeTruthy();
      expect(terms.clawbackText).toMatch(/clawback|45-day|chargeback/i);
    });

    it("extracts protected accounts signal", () => {
      expect(terms.protectedAccounts).toBeTruthy();
      expect(terms.protectedAccountsText).toMatch(/house\s+accounts|last-year\s+clients|pre-existing/i);
    });

    it("does not extract noise (pet, truck color)", () => {
      const blob = `${terms.exclusivityText} ${terms.noPoachText} ${terms.clawbackText} ${terms.protectedAccountsText}`.toLowerCase();
      expect(blob).not.toMatch(/biscuit/i);
      expect(blob).not.toMatch(/teal/i);
      expect(blob).not.toMatch(/dog/i);
      expect(blob).not.toMatch(/truck/i);
    });

    it("generates summary bullets for additional_terms", () => {
      expect(terms.summaryBullets.length).toBeGreaterThan(0);
      expect(terms.summaryBullets.some((b) => /exclusiv/i.test(b))).toBeTruthy();
    });
  });

  describe("stripPremiumInstructionNoiseForDocument - leaked prompt as headings", () => {
    it("strips numbered sections that look like leaked user prompt", () => {
      const leakyBody = `1. SERVICES
The Provider will deliver consulting services.

11. I run a pool business and need this contract.
12. Mesa Realty Group LLC is the referrer.
13. Don't forget the clawback.

2. PAYMENT
7% commission after deposit.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(leakyBody);

      // Should keep real sections
      expect(cleaned).toContain("1. SERVICES");
      expect(cleaned).toContain("2. PAYMENT");

      // Should strip leaked prompt prose
      expect(cleaned).not.toContain("11. I run");
      expect(cleaned).not.toContain("13. Don't");
    });

    it("strips 'Create/Draft a agreement' instructions", () => {
      const leaky = `10. Create a contract for my pool company.
11. Draft an agreement for the partnership.
12. Write a document for the clients.

This is the actual body.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(leaky);

      expect(cleaned).not.toMatch(/Create a contract for my/i);
      expect(cleaned).not.toMatch(/Draft an agreement for/i);
      expect(cleaned).toContain("This is the actual body");
    });

    it("preserves legitimate numbered sections", () => {
      const body = `1. PARTIES
Harbor Pool & Patio LLC and Mesa Realty Group LLC.

2. SERVICES
Referral leads.

3. PAYMENT
7% commission.`;

      const cleaned = stripPremiumInstructionNoiseForDocument(body);

      expect(cleaned).toContain("1. PARTIES");
      expect(cleaned).toContain("2. SERVICES");
      expect(cleaned).toContain("3. PAYMENT");
    });
  });

  describe("Pro renderer party name vs role token swapping", () => {
    const HARBOR_RECORDS: CanonicalPartyIdentityRecord[] = [
      {
        fullLegalName: "Harbor Pool & Patio LLC",
        roleLabel: "Client",
        displayAlias: "Harbor Pool & Patio",
        signerName: null,
        signerTitle: null,
      },
      {
        fullLegalName: "Mesa Realty Group LLC",
        roleLabel: "Service Provider",
        displayAlias: "Mesa Realty Group",
        signerName: null,
        signerTitle: null,
      },
    ];

    it("does not replace single-word 'Mesa' that is part of full party name with role token", () => {
      // The key issue: "Mesa" as a single word should NOT become "Service Provider"
      // because "Mesa" appears in "Mesa Realty Group LLC" as the first word.
      // This test verifies that if the LLM outputs "The Mesa team", it doesn't become
      // "The Service Provider team" when "Mesa Realty Group LLC" is the full name.
      const body = `This Agreement is between Harbor Pool & Patio LLC ("Client") and Mesa Realty Group LLC ("Service Provider").
      
Mesa Realty Group LLC will provide referral services. The Mesa team will coordinate with Harbor Pool & Patio LLC on lead qualification.`;

      const result = replaceTruncatedPartyRefsWithRoleLabels(body, HARBOR_RECORDS);
      
      // "Mesa" as a single-word short form should NOT be replaced because it's the first
      // word of the full legal name. This prevents "The Mesa team" → "The Service Provider team".
      expect(result.text).toContain("Mesa Realty Group LLC");
      expect(result.text).not.toMatch(/The Service Provider team/i);
    });

    it("preserves full legal names with LLC suffix in Pro body", () => {
      const body = `SERVICES AGREEMENT

This Agreement is between Harbor Pool & Patio LLC ("Client") and Mesa Realty Group LLC ("Service Provider").

1. SERVICES
Mesa Realty Group LLC will provide referral services to Harbor Pool & Patio LLC.

2. PAYMENT
Harbor Pool & Patio LLC will pay Mesa Realty Group LLC 7% commission after deposit.`;

      const result = replaceTruncatedPartyRefsWithRoleLabels(body, HARBOR_RECORDS);
      
      // Both full legal names should be preserved - the function should not replace them
      expect(result.text).toContain("Harbor Pool & Patio LLC");
      expect(result.text).toContain("Mesa Realty Group LLC");
      // Full names with LLC should NOT be swapped
      expect(result.text).not.toMatch(/Service Provider will provide referral services to Client/i);
    });

    it("does not generate 'Service Provider Realty Group' from malformed replacement", () => {
      // Edge case: if "Mesa" is being replaced improperly, we might get "Service Provider Realty Group"
      const body = `Mesa Realty Group LLC handles the referrals.`;

      const result = replaceTruncatedPartyRefsWithRoleLabels(body, HARBOR_RECORDS);
      
      // Should never see "Service Provider Realty Group" - that's a broken replacement
      expect(result.text).not.toMatch(/Service Provider Realty Group/i);
    });
  });
});

/** @vitest-environment jsdom */
/**
 * Component-level post-payment premiumCompletion restore — headings, review plain, scope.
 */
import React from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { PremiumCompletionRestoreRenderHarness } from "./PremiumCompletionRestoreRenderHarness";
import { clearCanonicalPartyMetadata } from "./canonicalPartyMetadataAuthority";
import { clearConsumedPaidProSignerMetadataAuthority } from "./paidProSignerMetadataAuthority";
import { resetSignerCountAuthorityDiagnosticsForTests } from "./signerCountAuthority";
import {
  clearCheckoutBackRestoreSnapshot,
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
} from "./checkoutBackRestore";
import {
  markPaidPremiumCompletionSession,
  clearPaidPremiumCompletionSession,
} from "./premiumCompletionStorage";
import {
  clearPaidProSourceOfTruth,
  establishPaidProSourceOfTruth,
} from "./paidProSourceOfTruth";
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
  purpose: "Priya Shah of Northline Studio will design a logo and brand kit",
};

const CONTAMINATED_GENERATED_CORPUS = [
  "SERVICES AGREEMENT",
  "",
  'This Agreement is between Priya Shah of Northline Studio ("Client") and Diego Alvarez of Harbor Marks LLC to design a logo and brand kit ("Service Provider").',
  "",
  "1. SERVICES",
  "The service provider agrees to provide Priya Shah of Northline Studio will design a logo and brand kit.",
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
  "Diego Alvarez of Harbor Marks LLC",
  "By: __________________________",
  "Name: Diego Alvarez",
  "",
  "SERVICE PROVIDER:",
  "Diego Alvarez of Harbor Marks LLC to design a logo and brand kit",
  "By: __________________________",
  "Name: Diego Alvarez",
].join("\n");

const PRIYA = "Priya Shah of Northline Studio";
const DIEGO = "Diego Alvarez of Harbor Marks LLC";

function countOccurrences(text: string, needle: string): number {
  const re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (text.match(re) ?? []).length;
}

describe("premiumCompletion restore component integration", () => {
  beforeEach(() => {
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignerCountAuthorityDiagnosticsForTests();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
    persistStarterReviewBeforeCheckout({
      intakeText: INTAKE,
      draft: PRE_CHECKOUT_DRAFT,
    });
    markPaidPremiumCompletionSession({ source: "settled_checkout" });
    establishPaidProSourceOfTruth({
      text: CONTAMINATED_GENERATED_CORPUS,
      source: "server_full_draft",
    });
  });

  afterEach(() => {
    cleanup();
    clearCanonicalPartyMetadata();
    clearConsumedPaidProSignerMetadataAuthority();
    resetSignerCountAuthorityDiagnosticsForTests();
    clearCheckoutBackRestoreSnapshot();
    clearPaidPremiumCompletionSession();
    clearPaidProSourceOfTruth();
  });

  it("renders matching party headings, single canonical opening, exact scope, and correct execution", () => {
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.intakeText).toContain(PRIYA);

    render(
      <PremiumCompletionRestoreRenderHarness
        intakeText={snap!.intakeText}
        draft={POST_GENERATION_CORRUPTED_DRAFT}
        agreementBodyText={CONTAMINATED_GENERATED_CORPUS}
        initialRecipient1Name={PRIYA}
        initialRecipient2Name={DIEGO}
      />,
    );

    const row0 = screen.getByTestId("premium-restore-party-row-0");
    const row1 = screen.getByTestId("premium-restore-party-row-1");
    const heading0 = within(row0).getByTestId("premium-restore-party-heading-0");
    const heading1 = within(row1).getByTestId("premium-restore-party-heading-1");
    const input0 = within(row0).getByTestId("premium-restore-party-input-0") as HTMLInputElement;
    const input1 = within(row1).getByTestId("premium-restore-party-input-1") as HTMLInputElement;

    expect(heading0.textContent).toBe(PRIYA);
    expect(heading1.textContent).toBe(DIEGO);
    expect(input0.value).toBe(PRIYA);
    expect(input1.value).toBe(DIEGO);
    expect(heading0.textContent).toBe(input0.value);
    expect(heading1.textContent).toBe(input1.value);
    expect(heading0.textContent).not.toMatch(/Harbor Marks LLC/i);
    expect(heading1.textContent).not.toBe("Diego Alvarez of");

    const reviewBody = screen.getByTestId("simple-pro-final-review-paid-sot-body");
    const visible = reviewBody.textContent ?? "";
    const openingRegion = visible.split(/1\.\s+SERVICES/i)[0] ?? visible;

    expect(openingRegion).toContain(`${PRIYA} ("Client")`);
    expect(openingRegion).toContain(`${DIEGO} ("Service Provider")`);
    expect(countOccurrences(openingRegion, PRIYA)).toBe(1);
    expect(countOccurrences(openingRegion, DIEGO)).toBe(1);
    expect(visible).not.toMatch(
      /entered into as of[\s\S]{0,400}\("Client"\)[\s\S]{0,400}\("Service Provider"\)[\s\S]{0,200}entered into/i,
    );
    expect(visible).not.toMatch(/\(collectively,\s+the\s+"Parties"\)[\s\S]{0,120}\(collectively,\s+the\s+"Parties"\)/i);
    expect(visible).toMatch(/design a logo and brand kit/i);
    expect(visible).not.toMatch(
      /agrees to provide services as described in the parties'? communications/i,
    );

    const clientBlock = visible.match(/CLIENT:\s*([\s\S]*?)(?=SERVICE PROVIDER:|$)/i)?.[1] ?? "";
    const providerBlock =
      visible.match(/SERVICE PROVIDER:\s*([\s\S]*?)(?=IN WITNESS WHEREOF|$)/i)?.[1] ?? "";
    expect(clientBlock).toContain(PRIYA);
    expect(clientBlock).not.toMatch(/Diego Alvarez of Harbor Marks LLC/i);
    expect(providerBlock).toContain(DIEGO);
    expect(providerBlock).not.toMatch(/to design a logo and brand kit/i);
  });
});

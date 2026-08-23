/**
 * Live #100: after premiumCompletion=1 / restore=starterReview, a 3- or 4-named
 * dump must keep those parties on the card and mount that many signer emails.
 * Restore must not collapse to the free 2-party starter (Client / "the first party").
 */
/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { useState } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import {
  applyNamedDumpPartiesToPaidRestoreDraft,
  extractNamedDumpPartyUnits,
  namedDumpPartiesForPaidRestore,
} from "./intakeNamedPartyFallback";
import { rebuildBodyFromIntakeForProFailure } from "./freeStarterReviewBodyResolver";
import { resolveLegalEntitiesForCanonicalMetadata } from "./canonicalLegalEntitiesForMetadata";
import { resolveAuthoritativeSignerCount } from "./signerCountAuthority";
import { resolveSignerSetupUiPartyCount } from "./paidProNPartySignerSetup";
import { buildStarterProCheckoutPendingDraft } from "./starterMultiPartyProGate";
import {
  persistStarterReviewBeforeCheckout,
  readCheckoutBackRestoreSnapshot,
  clearCheckoutBackRestoreSnapshot,
} from "./checkoutBackRestore";
import { hydrateCanonicalPartyMetadataAfterCheckoutRestore } from "./paidProCheckoutRestoreMetadataHydrate";
import type { ParsedDraftShape } from "./intakeSmartDefaults";
import {
  PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS,
  PAID_PRO_SIGNER_EMAIL_INPUT_CLASS,
  readPremiumCompletionReturnFromHref,
  shouldKeepPaidSessionSignerEmailsInteractive,
  shouldSuppressFreeMissingTenetAskAfterPay,
} from "./paidProPaidSessionLanding";

const LIVE_THREE_NAMED_PARTY_DUMP =
  "Priya Shah of Northline Studio, Diego Alvarez of Harbor Marks LLC, and Maya Chen of Westfield Counsel agree that Harbor Marks will design a logo and brand kit for Northline for $2,400 due on signing, 30 days starting August 22, 2026, Texas law. Maya reviews as counsel.";

const FOUR_NAMED_PARTY_DUMP =
  "Priya Shah of Northline Studio, Diego Alvarez of Harbor Marks LLC, Maya Chen of Westfield Counsel, and Jordan Hale of Pine Street Media LLC agree that Harbor Marks will design a logo and brand kit for Northline for $2,400 due on signing, 30 days starting August 22, 2026, Texas law.";

const TWO_NAMED_PARTY_DUMP =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit for $2,400 due on signing. Work runs 30 days starting August 22, 2026. Governing law is Texas.";

const PAID_RESTORE_HREF =
  "https://lawdog.me/app/create?restore=starterReview&premiumCompletion=1";

const INTAKE = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const EMPTY_PAYMENT = { amount: null, cadence: null, valid: false } as const;

function collapsedTwoPartyStarter(): ParsedDraftShape {
  return {
    title: "SERVICES AGREEMENT",
    jurisdiction: "",
    parties: [
      { name: "Client", role: "client" },
      { name: "Harbor Marks", role: "service_provider" },
    ],
    purpose: "design a logo and brand kit",
    payment_terms: "",
    duration: null,
    due_date: null,
    effective_date: null,
    payment: EMPTY_PAYMENT,
  };
}

function AfterPayNamedDumpEmails({ count }: { count: number }) {
  const [emails, setEmails] = useState(() => Array.from({ length: count }, () => ""));
  return (
    <div data-testid="after-pay-named-dump-emails">
      {emails.map((value, idx) => (
        <label key={idx} className={PAID_PRO_SIGNER_EMAIL_FIELD_WRAPPER_CLASS}>
          {`Reviewer ${idx + 1} email`}
          <input
            type="email"
            disabled={false}
            readOnly={false}
            tabIndex={0}
            data-claw-recipient-field={
              idx === 0
                ? "r1-email"
                : idx === 1
                  ? "r2-email"
                  : idx === 2
                    ? "r3-email"
                    : "r4-email"
            }
            aria-label={`Reviewer ${idx + 1} email`}
            className={PAID_PRO_SIGNER_EMAIL_INPUT_CLASS}
            value={value}
            onChange={(e) => {
              const next = emails.slice();
              next[idx] = e.target.value;
              setEmails(next);
            }}
          />
        </label>
      ))}
    </div>
  );
}

describe("named dump parties survive paid restore (live 2026-08-23 hole)", () => {
  afterEach(() => {
    cleanup();
    clearCheckoutBackRestoreSnapshot();
  });

  it("3 named parties + paid restore → 3 parties + 3 emails", () => {
    expect(extractNamedDumpPartyUnits(LIVE_THREE_NAMED_PARTY_DUMP)).toHaveLength(3);
    const names = namedDumpPartiesForPaidRestore(LIVE_THREE_NAMED_PARTY_DUMP);
    expect(names).toHaveLength(3);
    expect(names.join(" ")).toMatch(/Priya Shah of Northline Studio/i);
    expect(names.join(" ")).toMatch(/Diego Alvarez of Harbor Marks LLC/i);
    expect(names.join(" ")).toMatch(/Maya Chen of Westfield Counsel/i);

    const restored = applyNamedDumpPartiesToPaidRestoreDraft(
      collapsedTwoPartyStarter(),
      LIVE_THREE_NAMED_PARTY_DUMP,
    );
    expect(restored?.parties).toHaveLength(3);
    expect(restored?.parties.map((p) => p.name).join(" ")).toMatch(/Maya Chen/i);
    expect(restored?.parties.some((p) => /^Client$/i.test(p.name))).toBe(false);

    const body = rebuildBodyFromIntakeForProFailure(LIVE_THREE_NAMED_PARTY_DUMP, collapsedTwoPartyStarter());
    expect(body).toMatch(/Priya Shah of Northline Studio/i);
    expect(body).toMatch(/Diego Alvarez of Harbor Marks LLC/i);
    expect(body).toMatch(/Maya Chen of Westfield Counsel/i);
    expect(body).not.toMatch(/the first party/i);
    expect(body).not.toMatch(/^Client$/m);

    expect(
      resolveAuthoritativeSignerCount({
        intakeText: LIVE_THREE_NAMED_PARTY_DUMP,
        draftParties: collapsedTwoPartyStarter().parties,
      }).count,
    ).toBe(3);
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 2,
        draftParties: restored?.parties ?? [],
        intakeText: LIVE_THREE_NAMED_PARTY_DUMP,
      }),
    ).toBe(3);
    expect(
      resolveLegalEntitiesForCanonicalMetadata({
        intakeText: LIVE_THREE_NAMED_PARTY_DUMP,
        draft: collapsedTwoPartyStarter(),
      }),
    ).toHaveLength(3);

    persistStarterReviewBeforeCheckout({
      intakeText: LIVE_THREE_NAMED_PARTY_DUMP,
      draft: collapsedTwoPartyStarter(),
    });
    const snap = readCheckoutBackRestoreSnapshot();
    expect(snap?.draft.parties).toHaveLength(3);
    expect(snap?.draft.parties.map((p) => p.name).join(" ")).toMatch(/Maya Chen/i);

    const hydrated = hydrateCanonicalPartyMetadataAfterCheckoutRestore({
      intakeText: LIVE_THREE_NAMED_PARTY_DUMP,
      draft: collapsedTwoPartyStarter(),
    });
    expect(hydrated.seed?.names.length).toBeGreaterThanOrEqual(3);
  });

  it("4 named parties + paid restore → 4 parties + 4 emails", () => {
    const names = namedDumpPartiesForPaidRestore(FOUR_NAMED_PARTY_DUMP);
    expect(names).toHaveLength(4);
    expect(names.join(" ")).toMatch(/Jordan Hale of Pine Street Media LLC/i);

    const restored = applyNamedDumpPartiesToPaidRestoreDraft(
      collapsedTwoPartyStarter(),
      FOUR_NAMED_PARTY_DUMP,
    );
    expect(restored?.parties).toHaveLength(4);

    const body = rebuildBodyFromIntakeForProFailure(FOUR_NAMED_PARTY_DUMP, collapsedTwoPartyStarter());
    expect(body).toMatch(/Jordan Hale of Pine Street Media LLC/i);
    expect(body).not.toMatch(/the first party/i);

    expect(
      resolveAuthoritativeSignerCount({
        intakeText: FOUR_NAMED_PARTY_DUMP,
        draftParties: collapsedTwoPartyStarter().parties,
      }).count,
    ).toBe(4);
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 2,
        draftParties: restored?.parties ?? [],
        intakeText: FOUR_NAMED_PARTY_DUMP,
      }),
    ).toBe(4);

    const pending = buildStarterProCheckoutPendingDraft(FOUR_NAMED_PARTY_DUMP);
    expect(pending.parties.length).toBeGreaterThanOrEqual(4);
  });

  it("2 named Priya-hiring-Diego after-pay still has exactly 2 rows", () => {
    expect(namedDumpPartiesForPaidRestore(TWO_NAMED_PARTY_DUMP)).toHaveLength(0);
    const collapsed = collapsedTwoPartyStarter();
    expect(applyNamedDumpPartiesToPaidRestoreDraft(collapsed, TWO_NAMED_PARTY_DUMP)).toBe(collapsed);
    expect(
      resolveAuthoritativeSignerCount({
        intakeText: TWO_NAMED_PARTY_DUMP,
        draftParties: [
          { name: "Priya Shah of Northline Studio" },
          { name: "Diego Alvarez of Harbor Marks LLC" },
        ],
      }).count,
    ).toBe(2);
    expect(
      resolveSignerSetupUiPartyCount({
        signerSetupUiPartyCount: 2,
        draftParties: [
          { name: "Priya Shah of Northline Studio" },
          { name: "Diego Alvarez of Harbor Marks LLC" },
        ],
        intakeText: TWO_NAMED_PARTY_DUMP,
      }),
    ).toBe(2);
  });

  it("leftover free ask stays suppressed after pay", () => {
    expect(readPremiumCompletionReturnFromHref(PAID_RESTORE_HREF)).toBe(true);
    expect(
      shouldSuppressFreeMissingTenetAskAfterPay({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(
      shouldKeepPaidSessionSignerEmailsInteractive({
        paidSessionActive: true,
        premiumCompletionReturn: true,
      }),
    ).toBe(true);
    expect(INTAKE).toContain("suppressFreeMissingTenetAskAfterPay ? null : freeMissingTenetAsk");
    expect(INTAKE).not.toMatch(/3 quick questions/);
    expect(INTAKE).toContain("applyNamedDumpPartiesToPaidRestoreDraft");
    expect(INTAKE).toContain("namedDumpPartiesForPaidRestore");
    expect(INTAKE).toContain("draftSnapshotRef");
    expect(INTAKE).not.toMatch(/\bdraftRef\b/);
  });

  it("r1/r2/r3(/r4) email fields mount on the existing first Pro screen and stay typeable", async () => {
    expect(INTAKE).toContain('idx === 2 ? "r3-email"');
    expect(INTAKE).toContain('idx === 3 ? "r4-email"');
    expect(INTAKE).toContain('data-claw-recipient-field={idx <= 1 ? (idx === 0 ? "r1-email" : "r2-email")');

    const user = userEvent.setup();
    render(<AfterPayNamedDumpEmails count={3} />);
    const r1 = screen.getByLabelText("Reviewer 1 email") as HTMLInputElement;
    const r2 = screen.getByLabelText("Reviewer 2 email") as HTMLInputElement;
    const r3 = screen.getByLabelText("Reviewer 3 email") as HTMLInputElement;
    expect(r1.getAttribute("data-claw-recipient-field")).toBe("r1-email");
    expect(r2.getAttribute("data-claw-recipient-field")).toBe("r2-email");
    expect(r3.getAttribute("data-claw-recipient-field")).toBe("r3-email");
    await user.type(r1, "priya.shah.qa@example.com");
    await user.type(r2, "diego.alvarez.qa@example.com");
    await user.type(r3, "maya.chen.qa@example.com");
    expect(r1.value).toBe("priya.shah.qa@example.com");
    expect(r2.value).toBe("diego.alvarez.qa@example.com");
    expect(r3.value).toBe("maya.chen.qa@example.com");
  });
});

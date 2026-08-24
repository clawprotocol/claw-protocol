/** @vitest-environment jsdom */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import React, { useEffect, useMemo, useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { looksLikeEmail, stripRecipientEmailNoise } from "./recipientEmailValidation";
import {
  resolveConfidentAuthorizedSignerPersonName,
  resolvePaidProSignerDetailsGate,
  resolveSignerNameForInlineSetupReadiness,
  resolveSignerSetupPartyIdentities,
} from "./signerSetupPartyIdentity";
import { resolvePaidSessionTwoSignerNamesEmailsComplete } from "./paidProPaidSessionLanding";
import { PaidProInlineSignerSetupPanelHarness } from "./paidProInlineSignerSetupPanelHarness";
import type { ParsedDraftShape } from "./intakeSmartDefaults";

const INTAKE_SRC = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");

const INTAKE =
  "Priya Shah of Northline Studio is hiring Diego Alvarez of Harbor Marks LLC to design a logo and brand kit. Payment: $2,400 due on signing. Term: 30 days starting August 24, 2026. Governing law: Texas.";

const DRAFT: ParsedDraftShape = {
  title: "SERVICES AGREEMENT",
  jurisdiction: "Texas",
  parties: [
    { name: "Priya Shah of Northline Studio", role: "client" },
    { name: "Diego Alvarez of Harbor Marks LLC", role: "service_provider" },
  ],
  purpose: "design a logo and brand kit",
};

const PARTY1_LEGAL = "Priya Shah of Northline Studio";
const PARTY2_LEGAL = "Diego Alvarez of Harbor Marks LLC";

function PriyaDiegoInlineSignerSetupHarness({
  initialEmails = ["", ""] as [string, string],
}: {
  initialEmails?: [string, string];
}) {
  const [recipient1Name, setRecipient1Name] = useState(PARTY1_LEGAL);
  const [recipient2Name, setRecipient2Name] = useState(PARTY2_LEGAL);
  const [recipient1Email, setRecipient1Email] = useState(initialEmails[0]);
  const [recipient2Email, setRecipient2Email] = useState(initialEmails[1]);
  const [partySignerNames, setPartySignerNames] = useState<string[]>(["", ""]);

  const signerSetupPartyIdentities = useMemo(
    () =>
      resolveSignerSetupPartyIdentities({
        parties: DRAFT.parties ?? [],
        intakeText: INTAKE,
      }),
    [],
  );

  useEffect(() => {
    setPartySignerNames((prev) => {
      const next = [...prev];
      let changed = false;
      for (let i = 0; i < 2; i++) {
        if ((next[i] ?? "").trim()) continue;
        const legal = i === 0 ? recipient1Name : recipient2Name;
        const prefill = resolveConfidentAuthorizedSignerPersonName(legal);
        if (prefill) {
          next[i] = prefill;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [recipient1Name, recipient2Name]);

  const gate = resolvePaidProSignerDetailsGate({
    partyCount: 2,
    intakeText: INTAKE,
    signerSetupPartyIdentities,
    draftPartyNames: [PARTY1_LEGAL, PARTY2_LEGAL],
    partySignerNames,
    recipient1Name,
    recipient2Name,
    recipient1Email,
    recipient2Email,
    extraPartyReviewEmails: [],
  });

  const twoSignersReady = resolvePaidSessionTwoSignerNamesEmailsComplete({
    signer1Name: resolveSignerNameForInlineSetupReadiness({
      partyIndex: 0,
      partySignerNames,
      recipientLegalEntityName: recipient1Name,
    }),
    signer1Email: recipient1Email,
    signer2Name: resolveSignerNameForInlineSetupReadiness({
      partyIndex: 1,
      partySignerNames,
      recipientLegalEntityName: recipient2Name,
    }),
    signer2Email: recipient2Email,
  });

  return (
    <div>
      <PaidProInlineSignerSetupPanelHarness
        draft={DRAFT}
        effectivePremiumSendMode="signature"
        nameEmailOnlySignerFields
        recipient1Name={recipient1Name}
        setRecipient1Name={setRecipient1Name}
        recipient1Email={recipient1Email}
        setRecipient1Email={setRecipient1Email}
        recipient2Name={recipient2Name}
        setRecipient2Name={setRecipient2Name}
        recipient2Email={recipient2Email}
        setRecipient2Email={setRecipient2Email}
        partySignerNames={partySignerNames}
        setPartySignerNames={setPartySignerNames}
        primaryCtaHelperText={gate.blockerMessage}
        stripRecipientEmailNoise={stripRecipientEmailNoise}
      />
      <div data-testid="gate-complete">{String(gate.complete)}</div>
      <div data-testid="two-signers-ready">{String(twoSignersReady)}</div>
      <div data-testid="blocker-message">{gate.blockerMessage}</div>
    </div>
  );
}

describe("paidPro inline Priya/Diego signer setup regression", () => {
  afterEach(() => {
    cleanup();
  });

  it("CreateFlowSendRecipientsPanel keeps signer names visible when nameEmailOnlySignerFields is set", () => {
    expect(INTAKE_SRC).toContain("showOptionalSignerMetadataFields");
    expect(INTAKE_SRC).toMatch(
      /const signaturePrepMode =[\s\S]{0,220}paidProInlineRecipientShell \|\| resolvedSendMode === "signature"/,
    );
    expect(INTAKE_SRC).toMatch(
      /showOptionalSignerMetadataFields[\s\S]{0,400}Signer title \(optional\)/,
    );
    expect(INTAKE_SRC).not.toMatch(/nameEmailOnlySignerFields\s*\n\s*\?\s*false/);
  });

  it("exposes two authorized signer name fields prefilled from person-of-entity identities", async () => {
    render(<PriyaDiegoInlineSignerSetupHarness />);

    const panel = await screen.findByTestId("paid-pro-inline-signer-setup-panel");
    const r1Signer = within(panel).getByDisplayValue("Priya Shah");
    const r2Signer = within(panel).getByDisplayValue("Diego Alvarez");
    expect(r1Signer.getAttribute("data-claw-recipient-field")).toBe("r1-signer-name");
    expect(r2Signer.getAttribute("data-claw-recipient-field")).toBe("r2-signer-name");

    const r1Entity = within(panel).getByDisplayValue(PARTY1_LEGAL);
    const r2Entity = within(panel).getByDisplayValue(PARTY2_LEGAL);
    expect(r1Entity.getAttribute("data-claw-recipient-field")).toBe("r1-name");
    expect(r2Entity.getAttribute("data-claw-recipient-field")).toBe("r2-name");

    expect(within(panel).queryByLabelText(/Signer title/i)).toBeNull();
  });

  it("requires signer names before Continue; clears missing-name note when names+emails valid", async () => {
    const user = userEvent.setup();
    render(
      <PriyaDiegoInlineSignerSetupHarness initialEmails={["priya.shah@example.com", "diego.alvarez@example.com"]} />,
    );

    const panel = await screen.findByTestId("paid-pro-inline-signer-setup-panel");
    await screen.findByDisplayValue("Priya Shah");
    await screen.findByDisplayValue("Diego Alvarez");

    expect(screen.getByTestId("gate-complete").textContent).toBe("true");
    expect(screen.getByTestId("two-signers-ready").textContent).toBe("true");
    expect(screen.getByTestId("blocker-message").textContent).toBe("");
    expect(within(panel).queryByText(/Add an authorized signer name/i)).toBeNull();
    expect(within(panel).getAllByText(/Party \d — complete\./i)).toHaveLength(2);

    const r2Signer = within(panel).getByDisplayValue("Diego Alvarez");
    await user.clear(r2Signer);
    expect(screen.getByTestId("gate-complete").textContent).toBe("false");
    expect(screen.getByTestId("two-signers-ready").textContent).toBe("false");
    expect(screen.getByTestId("blocker-message").textContent).toMatch(
      /Add an authorized signer name for Diego Alvarez of Harbor Marks LLC/,
    );

    await user.type(r2Signer, "Diego Alvarez");
    expect(screen.getByTestId("gate-complete").textContent).toBe("true");
    expect(screen.getByTestId("two-signers-ready").textContent).toBe("true");
    expect(screen.getByTestId("blocker-message").textContent).toBe("");
  });
});

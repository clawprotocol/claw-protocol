/**
 * Live fail 2026-09-01 staging Screen 2 (d4faeae): persist Review Northline/Harbor
 * opened Signer details with review-default send mode. Emails filled, badges said
 * PARTY n COMPLETE, sticky still required an authorized signer name — but the name
 * input was not rendered because `signaturePrepMode` short-circuited on review.
 *
 * Contract:
 * - Signer details must show an authorized signer name field per party (title optional).
 * - Tests FAIL if name is required but the name input is not rendered.
 * - Tests FAIL if email-only can flip PARTY COMPLETE while name is still required.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  formatPartySetupRowStatus,
  resolveSignerDetailsSignaturePrepMode,
} from "./paidProNPartySignerSetup";
import { resolvePaidProSignerDetailsGate } from "./signerSetupPartyIdentity";

const NORTHLINE = "Northline Studio";
const HARBOR = "Harbor Marks LLC";
const NORTHLINE_EMAIL = "cryptocurated21+priya@gmail.com";
const HARBOR_EMAIL = "cryptocurated21+harbor@gmail.com";

describe("Signer details authorized signer name field", () => {
  it("inline Signer details requires a name field even when send mode is review", () => {
    expect(
      resolveSignerDetailsSignaturePrepMode({
        paidProInlineRecipientShell: true,
        resolvedSendMode: "review",
      }),
    ).toBe(true);
  });

  it("review-only recipient setup (not the Signer details shell) does not require names", () => {
    expect(
      resolveSignerDetailsSignaturePrepMode({
        paidProInlineRecipientShell: false,
        resolvedSendMode: "review",
      }),
    ).toBe(false);
  });

  it("signature send mode requires names without the inline shell", () => {
    expect(
      resolveSignerDetailsSignaturePrepMode({
        paidProInlineRecipientShell: false,
        resolvedSendMode: "signature",
      }),
    ).toBe(true);
  });

  it("fails if email-only can flip PARTY COMPLETE while name is still required", () => {
    const requireName = resolveSignerDetailsSignaturePrepMode({
      paidProInlineRecipientShell: true,
      resolvedSendMode: "review",
    });
    expect(requireName).toBe(true);
    expect(
      formatPartySetupRowStatus({
        partyIndex: 0,
        legalEntity: NORTHLINE,
        signerName: "",
        email: NORTHLINE_EMAIL,
        signaturePrepMode: requireName,
      }),
    ).toBe("Party 1 — authorized signer name needed.");
    expect(
      formatPartySetupRowStatus({
        partyIndex: 1,
        legalEntity: HARBOR,
        signerName: "",
        email: HARBOR_EMAIL,
        signaturePrepMode: requireName,
      }),
    ).toBe("Party 2 — authorized signer name needed.");

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [NORTHLINE, HARBOR],
      partySignerNames: ["", ""],
      recipient1Name: NORTHLINE,
      recipient2Name: HARBOR,
      recipient1Email: NORTHLINE_EMAIL,
      recipient2Email: HARBOR_EMAIL,
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(false);
    expect(gate.blockers.some((b) => b.field === "signer_name")).toBe(true);
    expect(gate.firstIncompleteFieldKey).toBe("r1-signer-name");
    expect(gate.blockerMessage).toMatch(/authorized signer name for Northline Studio/i);
  });

  it("name + email flips COMPLETE and unlocks the save gate", () => {
    const requireName = resolveSignerDetailsSignaturePrepMode({
      paidProInlineRecipientShell: true,
      resolvedSendMode: "review",
    });
    expect(
      formatPartySetupRowStatus({
        partyIndex: 0,
        legalEntity: NORTHLINE,
        signerName: "Priya North",
        email: NORTHLINE_EMAIL,
        signaturePrepMode: requireName,
      }),
    ).toBe("Party 1 — complete.");
    expect(
      formatPartySetupRowStatus({
        partyIndex: 1,
        legalEntity: HARBOR,
        signerName: "Jordan Harbor",
        email: HARBOR_EMAIL,
        signaturePrepMode: requireName,
      }),
    ).toBe("Party 2 — complete.");

    const gate = resolvePaidProSignerDetailsGate({
      partyCount: 2,
      draftPartyNames: [NORTHLINE, HARBOR],
      partySignerNames: ["Priya North", "Jordan Harbor"],
      recipient1Name: NORTHLINE,
      recipient2Name: HARBOR,
      recipient1Email: NORTHLINE_EMAIL,
      recipient2Email: HARBOR_EMAIL,
      extraPartyReviewEmails: [],
    });
    expect(gate.complete).toBe(true);
    expect(gate.blockers).toEqual([]);
  });

  it("fails if name is required but the name input is not rendered", () => {
    const intake = readFileSync(join(__dirname, "AgreementBuilderIntake.tsx"), "utf8");
    const panelStart = intake.indexOf("function CreateFlowSendRecipientsPanel(");
    expect(panelStart).toBeGreaterThan(-1);
    const panelEnd = intake.indexOf("\n  const advDetailsClass", panelStart);
    const panel = intake.slice(panelStart, panelEnd > panelStart ? panelEnd : panelStart + 12000);

    expect(panel).toContain("resolveSignerDetailsSignaturePrepMode");
    expect(panel).toContain("paidProInlineRecipientShell");
    expect(panel).toContain("resolvedSendMode");
    expect(panel).not.toMatch(
      /const signaturePrepMode =\s*resolvedSendMode === ["']review["']\s*\?\s*false/,
    );

    const sigBlockStart = panel.indexOf("{signaturePrepMode ? (");
    expect(sigBlockStart).toBeGreaterThan(-1);
    const sigBlock = panel.slice(sigBlockStart, sigBlockStart + 2800);
    expect(sigBlock).toContain("r1-signer-name");
    expect(sigBlock).toContain("r2-signer-name");
    expect(sigBlock).toContain("Signer name");
    expect(sigBlock).toContain("Signer title (optional)");
  });
});

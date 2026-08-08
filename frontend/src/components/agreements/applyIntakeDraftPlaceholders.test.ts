import { describe, expect, it } from "vitest";
import {
  applyIntakeDraftPlaceholders,
  corpusHasClarificationStyleIdentityPlaceholders,
  extractGoverningLawFromIntake,
} from "./applyIntakeDraftPlaceholders";
import { polishProAgreementDisplayLayer } from "./polishProAgreementDisplayLayer";

const INTAKE =
  "Draft a 12-month SaaS subscription agreement between ABC LLC and Sample Corp for approximately $240k ACV. " +
  "Out of scope: PHI/HIPAA, PCI, children's data, classified / controlled gov data. " +
  "Governing law: Nevada.";

const PLACEHOLDER_BODY = `SAAS SUBSCRIPTION AGREEMENT

This SaaS Subscription Agreement is entered into by and between [Your Company Legal Name] (“Provider”) and [Customer Legal Name] (“Customer”).

3.3 Excluded Data. Customer will not submit to the Service protected health information or other data regulated by HIPAA, payment card data subject to PCI standards, classified information, or controlled government data.

12.5 Governing Law and Venue. This Agreement is governed by the laws of [State], without regard to conflict of laws principles. The state and federal courts located in [State] will have exclusive jurisdiction.

EXHIBIT A
DATA PROCESSING TERMS
G. Conflicts
`;

describe("applyIntakeDraftPlaceholders", () => {
  it("fills Your Company Legal Name / Customer Legal Name / State from intake", () => {
    expect(extractGoverningLawFromIntake(INTAKE)).toBe("Nevada");
    const { text, repairs } = applyIntakeDraftPlaceholders({
      text: PLACEHOLDER_BODY,
      intakeText: INTAKE,
    });
    expect(text).toContain("ABC LLC");
    expect(text).toContain("Sample Corp");
    expect(text).not.toMatch(/\[Your Company Legal Name\]/i);
    expect(text).not.toMatch(/\[Customer Legal Name\]/i);
    expect(text).toMatch(/laws of Nevada/);
    expect(text).toMatch(/courts located in Nevada/);
    expect(text).not.toMatch(/\[State\]/);
    expect(text).toMatch(/children's data/i);
    expect(repairs.some((r) => r.startsWith("intake_placeholder:"))).toBe(true);
    expect(corpusHasClarificationStyleIdentityPlaceholders(text)).toBe(false);
  });

  it("polish display layer fact-fills clarification-style placeholders from intake", () => {
    const polished = polishProAgreementDisplayLayer(PLACEHOLDER_BODY, {
      intakeText: INTAKE,
      draft: {
        parties: [
          { name: "ABC LLC", role: "Provider" },
          { name: "Sample Corp", role: "Customer" },
        ],
      } as never,
      reviewDisplayMode: true,
    });
    expect(polished.text).toContain("ABC LLC");
    expect(polished.text).toContain("Sample Corp");
    expect(polished.text).toMatch(/Nevada/);
    expect(polished.text).not.toMatch(/\[Your Company Legal Name\]|\[Customer Legal Name\]|\[State\]/i);
  });
});

describe("execution tail before exhibits", () => {
  it("rebuilds signature skeleton before EXHIBIT sections", async () => {
    const { ensurePaidProAcceptanceExecutionBlockInvariant } = await import(
      "./paidProAcceptanceExecutionBlockInvariant"
    );
    const body = `${PLACEHOLDER_BODY.replace(/\[Your Company Legal Name\]/g, "ABC LLC").replace(
      /\[Customer Legal Name\]/g,
      "Sample Corp",
    ).replace(/\[State\]/g, "Nevada")}`;
    const { text } = ensurePaidProAcceptanceExecutionBlockInvariant(body, [
      {
        fullLegalName: "ABC LLC",
        roleLabel: "Provider",
        displayAlias: "ABC",
        signerName: null,
        signerTitle: null,
        partyAddress: null,
      },
      {
        fullLegalName: "Sample Corp",
        roleLabel: "Customer",
        displayAlias: "Sample",
        signerName: null,
        signerTitle: null,
        partyAddress: null,
      },
    ]);
    expect(text).toMatch(/IN WITNESS WHEREOF/i);
    const witness = text.search(/IN WITNESS WHEREOF/i);
    const exhibit = text.search(/EXHIBIT A/i);
    expect(witness).toBeGreaterThan(0);
    expect(exhibit).toBeGreaterThan(witness);
  });
});

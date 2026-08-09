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

describe("N-party ordered placeholder fill (2–4)", () => {
  it("fills Party 1..3 Legal Name brackets from among intake", () => {
    const intake =
      "Draft a services agreement among River Alpha LLC, Harbor Beta Inc, and Summit Gamma LP " +
      "for $22,000 over 90 days. Governing law: Colorado.";
    const body =
      "This Agreement is among [Party 1 Legal Name], [Party 2 Legal Name], and [Party 3 Legal Name]. " +
      "Governing law: [State].";
    const { text } = applyIntakeDraftPlaceholders({ text: body, intakeText: intake });
    expect(text).toContain("River Alpha LLC");
    expect(text).toContain("Harbor Beta Inc");
    expect(text).toContain("Summit Gamma LP");
    expect(text).toContain("Colorado");
    expect(text).not.toMatch(/\[Party [123] Legal Name\]|\[State\]/i);
  });

  it("fills four Party N brackets and does not invent a fifth", () => {
    const intake =
      "Draft among One LLC, Two Inc, Three Corp, and Four LP for $40k over 6 months. Governing law: Oregon.";
    const body =
      "Parties: [Party 1 Legal Name]; [Party 2 Legal Name]; [Party 3 Legal Name]; [Party 4 Legal Name]; [Party 5 Legal Name].";
    const { text } = applyIntakeDraftPlaceholders({ text: body, intakeText: intake });
    expect(text).toContain("One LLC");
    expect(text).toContain("Four LP");
    expect(text).toMatch(/\[Party 5 Legal Name\]/);
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

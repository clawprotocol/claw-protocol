import { describe, expect, it } from "vitest";
import {
  renderESignatureSection,
  renderIntroClause,
  renderNoticesSection,
  renderOwnershipSection,
  renderPaymentSection,
  renderSupportSection,
  renderTerminationSection,
} from "./proCommercialProseRenderer";
import { extractProtectedCommercialClusters, reconstructProSectionsFromSemanticBlocks, renderSemanticBlock } from "./proSemanticBlocks";

const TEST102 = `
ABC LLC hires Jordan Lee Consulting for AI workflow implementation, dashboard setup, automation support, onboarding assistance, and light ongoing maintenance.
ABC LLC is Client. Jordan Lee Consulting is Service Provider.
$120,000 total project fee. Client owns deliverables after payment; Service Provider retains pre-existing tools.
No guaranteed third-party AI uptime. 30 days written notice. Notices by email. Oklahoma law.
`.trim();

const PARTIES = {
  clientLegalName: "ABC LLC",
  serviceProviderLegalName: "Jordan Lee Consulting",
  clientRoleLabel: "Client",
  serviceProviderRoleLabel: "Service Provider",
  partiesLabel: "Parties",
};

function expectNoGenericRendererLanguage(text: string): void {
  expect(text).not.toMatch(/the applicable Party/i);
  expect(text).not.toMatch(/applicable deliverables/i);
  expect(text).not.toMatch(/applicable Party retained materials/i);
  expect(text).not.toMatch(/commercial terms include/i);
}

describe("proCommercialProseRenderer", () => {
  it("test102 renders role-aware payment and ownership prose without generic leakage", () => {
    const payment = renderPaymentSection({ ...PARTIES, amount: "$120,000" });
    const ownership = renderOwnershipSection(PARTIES);
    const combined = `${renderIntroClause(PARTIES)}\n${payment}\n${ownership}`;

    expect(payment).toBe("Client will pay Service Provider a total project fee of $120,000 for the services described in this Agreement.");
    expect(ownership).toMatch(/Client will own the deliverables created specifically for Client/i);
    expect(ownership).toMatch(/Service Provider retains its pre-existing tools, templates, know-how, methods, and background materials/i);
    expect(combined).toContain('ABC LLC ("Client")');
    expect(combined).toContain('Jordan Lee Consulting ("Service Provider")');
    expectNoGenericRendererLanguage(combined);
  });

  it("renders support, termination, notices, and e-signature sections with party roles", () => {
    const text = [
      renderSupportSection({ ...PARTIES, supportDescription: "automation support and onboarding assistance" }),
      renderTerminationSection({ ...PARTIES, terminationNotice: "30 days written notice" }),
      renderNoticesSection({ ...PARTIES, noticesMethod: "email to the addresses on file" }),
      renderESignatureSection(PARTIES),
    ].join("\n");
    expect(text).toMatch(/Service Provider will provide automation support and onboarding assistance/i);
    expect(text).toMatch(/Either Party may terminate this Agreement by giving 30 days written notice/i);
    expect(text).toMatch(/Parties may deliver notices by email/i);
    expect(text).toMatch(/Parties may sign this Agreement electronically/i);
    expectNoGenericRendererLanguage(text);
  });

  it("semantic blocks use polished commercial prose for payment and ownership", () => {
    const blocks = extractProtectedCommercialClusters(TEST102);
    const payment = blocks.find((block) => block.id === "payment_block");
    const ownership = blocks.find((block) => block.id === "ownership_block");
    expect(payment).toBeTruthy();
    expect(ownership).toBeTruthy();

    const rendered = `${renderSemanticBlock(payment!, PARTIES)}\n${renderSemanticBlock(ownership!, PARTIES)}`;
    expect(rendered).toMatch(/Client will pay Service Provider a total project fee of \$120,000/i);
    expect(rendered).toMatch(/Client will own the deliverables created specifically for Client/i);
    expect(rendered).toMatch(/Service Provider retains/i);
    expectNoGenericRendererLanguage(rendered);
  });

  it("reconstructed sections do not emit generic commercial labels", () => {
    const result = reconstructProSectionsFromSemanticBlocks(
      `
AI Services Agreement

1. Purpose and Scope
Services are provided.

2. Fees and Payment
The commercial terms include $120,000.

3. Ownership and Work Product
The applicable Party owns applicable deliverables.
`.trim(),
      { intakeText: TEST102, draftText: TEST102 },
    );
    expect(result.text).toMatch(/Client will pay Service Provider a total project fee of \$120,000/i);
    expect(result.text).toMatch(/Client will own the deliverables created specifically for Client/i);
    expectNoGenericRendererLanguage(result.text);
  });
});

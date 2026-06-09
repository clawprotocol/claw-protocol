/** @vitest-environment jsdom */
/**
 * Full VS01 Prepare-for-e-signing render-path regression: execution metadata must survive
 * normalizeLines → paginateCorpus → buildVs01SigningPacketModel → Vs01CanonicalSigningPage
 * (same component stack as StepPrepareSignature agreementBridgePlacementCopy path).
 */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  normalizeSigningPacketCorpusLines,
  VS01_PACKET_PAGE_WIDTH_PT,
} from "./buildVs01SigningPacketModel";
import {
  buildFlowLineDescriptors,
  flowLinesForPage,
} from "./vs01CanonicalTextLayout";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";

const STARTER_749 = `${"Starter free preview clause. ".repeat(40)}`.slice(0, 749);

const SARAH_EMAIL = "sarah@example.com";
const SARAH_ADDRESS = "123 Main Street, Dallas, TX 75001";
const MICHAEL_EMAIL = "michael@example.com";
const MICHAEL_ADDRESS = "456 Oak Avenue, Tulsa, OK 74103";

const EMAIL_ADDRESS_COLLAPSE_RE = /Email for Notice:.*Address for Notice:/i;

function rolesForExecutionMetadata() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_vs01_execution_metadata_render_path",
    creatorName: "Blue Canyon Analytics LLC",
    creatorEmail: SARAH_EMAIL,
    ownerSignerName: "Sarah Mitchell",
    ownerSignerTitle: "CEO",
    counterparties: [
      {
        id: "cp1",
        name: "Iron Vale Systems Inc.",
        email: MICHAEL_EMAIL,
        signerName: "Michael Torres",
        signerTitle: "President",
      },
    ],
  });
}

function buildExecutionMetadataCorpus(repeat = 85): string {
  return `${"Premium operational clause with detailed implementation duties, milestones, remedies, and payment mechanics. ".repeat(repeat)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT: Blue Canyon Analytics LLC
By: _________________________________
Name: Sarah Mitchell
Title: CEO
Email for Notice: ${SARAH_EMAIL}
Address for Notice: ${SARAH_ADDRESS}
Date: _____________________________

SERVICE PROVIDER: Iron Vale Systems Inc.
By: _________________________________
Name: Michael Torres
Title: President
Email for Notice: ${MICHAEL_EMAIL}
Address for Notice: ${MICHAEL_ADDRESS}
Date: _____________________________`;
}

function emailLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => /^Email for Notice:/i.test(line));
}

function addressLines(lines: readonly string[]): string[] {
  return lines.map((line) => line.trim()).filter((line) => /^Address for Notice:/i.test(line));
}

function assertSeparateEmailAndAddressLines(lines: readonly string[], stage: string): void {
  expect(emailLines(lines).length, `${stage}: email line count`).toBe(2);
  expect(addressLines(lines).length, `${stage}: address line count`).toBe(2);
  for (const line of lines) {
    expect(line, `${stage}: collapsed email+address on one line`).not.toMatch(EMAIL_ADDRESS_COLLAPSE_RE);
  }
  expect(emailLines(lines).join("\n")).toContain(SARAH_EMAIL);
  expect(emailLines(lines).join("\n")).toContain(MICHAEL_EMAIL);
  expect(addressLines(lines).join("\n")).toContain(SARAH_ADDRESS);
  expect(addressLines(lines).join("\n")).toContain(MICHAEL_ADDRESS);
}

function renderedCanonicalTextLines(container: HTMLElement): string[] {
  return [...container.querySelectorAll("[data-vs01-canonical-text]")]
    .map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function findWitnessPage(model: ReturnType<typeof buildVs01SigningPacketModel>) {
  return model.pages.find((page) =>
    page.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
  );
}

describe("VS01 Prepare execution metadata full render path", () => {
  it("preserves Email and Address on separate lines through normalize, model, layout, and DOM render", () => {
    const corpus = buildExecutionMetadataCorpus();
    const roles = rolesForExecutionMetadata();

    // 1. normalizeLines (pre-pagination corpus normalization)
    const normalized = normalizeSigningPacketCorpusLines(corpus);
    assertSeparateEmailAndAddressLines(normalized, "normalizeSigningPacketCorpusLines");

    // 2. buildVs01SigningPacketModel (paginateCorpus + field placement)
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: corpus,
      roles,
      corpusGateArgs: { freeBaselinePlain: STARTER_749 },
      initialsEnabled: false,
    });
    expect(model.allowed).toBe(true);

    const modelFlowLines = model.pages.flatMap((page) => page.flowLines);
    const modelTextBlocks = model.pages.flatMap((page) => page.textBlocks.map((block) => block.text));
    assertSeparateEmailAndAddressLines(modelFlowLines, "model.flowLines");
    assertSeparateEmailAndAddressLines(modelTextBlocks, "model.textBlocks");

    const witnessPage = findWitnessPage(model);
    expect(witnessPage).toBeTruthy();
    expect(witnessPage!.signatureLineAnchors.length).toBeGreaterThanOrEqual(2);

    // 3. Pagination / canonical flow layout descriptors (same path as Vs01CanonicalSigningPage)
    const witnessFlow = flowLinesForPage(witnessPage!);
    assertSeparateEmailAndAddressLines(witnessFlow, "witnessFlowLines");
    const descriptors = buildFlowLineDescriptors(witnessFlow);
    const descriptorTexts = descriptors.map((d) => d.trimmed).filter(Boolean);
    assertSeparateEmailAndAddressLines(descriptorTexts, "buildFlowLineDescriptors");
    expect(descriptors.some((d) => /^Email for Notice:/i.test(d.trimmed))).toBe(true);
    expect(descriptors.some((d) => /^Address for Notice:/i.test(d.trimmed))).toBe(true);
    expect(descriptors.filter((d) => d.kind === "signature_label").length).toBeGreaterThanOrEqual(6);

    // 4. Final packet render — Vs01CanonicalSigningPage (StepPrepareSignature canonical path)
    const renderedLines: string[] = [];
    for (const page of model.pages) {
      const { container, unmount } = render(
        <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />,
      );
      renderedLines.push(...renderedCanonicalTextLines(container));
      unmount();
    }
    assertSeparateEmailAndAddressLines(renderedLines, "Vs01CanonicalSigningPage DOM");
    expect(renderedLines.some((line) => /Sarah Mitchell/i.test(line))).toBe(true);
    expect(renderedLines.some((line) => /Michael Torres/i.test(line))).toBe(true);
    expect(renderedLines.some((line) => line.includes(SARAH_ADDRESS))).toBe(true);
    expect(renderedLines.some((line) => line.includes(MICHAEL_ADDRESS))).toBe(true);

    const witnessDom = render(
      <Vs01CanonicalSigningPage page={witnessPage!} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />,
    );
    const witnessRendered = renderedCanonicalTextLines(witnessDom.container);
    assertSeparateEmailAndAddressLines(witnessRendered, "witness page DOM");
    expect(witnessRendered.join("\n")).toMatch(/IN WITNESS WHEREOF/i);
    witnessDom.unmount();

    // 5. Guided Pro Prepare uses canonical flow textBlocks (not PDF.js extraction) — verify packet text source
    const packetPlainTextLines = model.pages.flatMap((page) =>
      page.textBlocks.map((block) => block.text.trim()).filter(Boolean),
    );
    assertSeparateEmailAndAddressLines(packetPlainTextLines, "packet textBlocks (PDF-equivalent source)");
    expect(packetPlainTextLines.join("\n")).not.toMatch(EMAIL_ADDRESS_COLLAPSE_RE);
  });
});

/** @vitest-environment jsdom */
/**
 * Full VS01 Prepare-for-e-signing render-path regression: signing-capacity execution metadata must survive
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
const MICHAEL_EMAIL = "michael@example.com";

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
Date: _____________________________

SERVICE PROVIDER: Iron Vale Systems Inc.
By: _________________________________
Name: Michael Torres
Title: President
Date: _____________________________`;
}

function assertSigningCapacityWitnessLines(lines: readonly string[], stage: string): void {
  const trimmed = lines.map((line) => line.trim()).filter(Boolean);
  expect(trimmed.some((line) => /^Name:/i.test(line)), `${stage}: name lines`).toBe(true);
  expect(trimmed.some((line) => /^Title:/i.test(line)), `${stage}: title lines`).toBe(true);
  expect(trimmed.some((line) => /^Date:/i.test(line)), `${stage}: date lines`).toBe(true);
  expect(trimmed.filter((line) => /^Email for Notice:/i.test(line)), `${stage}: email notice lines`).toHaveLength(0);
  expect(trimmed.filter((line) => /^Address for Notice:/i.test(line)), `${stage}: address notice lines`).toHaveLength(0);
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
  it("preserves signing-capacity fields through normalize, model, layout, and DOM render", () => {
    const corpus = buildExecutionMetadataCorpus();
    const roles = rolesForExecutionMetadata();

    const normalized = normalizeSigningPacketCorpusLines(corpus);
    assertSigningCapacityWitnessLines(normalized, "normalizeSigningPacketCorpusLines");

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
    assertSigningCapacityWitnessLines(modelFlowLines, "model.flowLines");
    assertSigningCapacityWitnessLines(modelTextBlocks, "model.textBlocks");

    const witnessPage = findWitnessPage(model);
    expect(witnessPage).toBeTruthy();
    expect(witnessPage!.signatureLineAnchors.length).toBeGreaterThanOrEqual(2);

    const witnessFlow = flowLinesForPage(witnessPage!);
    assertSigningCapacityWitnessLines(witnessFlow, "witnessFlowLines");
    const descriptors = buildFlowLineDescriptors(witnessFlow);
    const descriptorTexts = descriptors.map((d) => d.trimmed).filter(Boolean);
    assertSigningCapacityWitnessLines(descriptorTexts, "buildFlowLineDescriptors");
    expect(descriptors.filter((d) => d.kind === "signature_label").length).toBeGreaterThanOrEqual(4);

    const renderedLines: string[] = [];
    for (const page of model.pages) {
      const { container, unmount } = render(
        <Vs01CanonicalSigningPage page={page} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />,
      );
      renderedLines.push(...renderedCanonicalTextLines(container));
      unmount();
    }
    assertSigningCapacityWitnessLines(renderedLines, "Vs01CanonicalSigningPage DOM");
    expect(renderedLines.some((line) => /Sarah Mitchell/i.test(line))).toBe(true);
    expect(renderedLines.some((line) => /Michael Torres/i.test(line))).toBe(true);

    const witnessDom = render(
      <Vs01CanonicalSigningPage page={witnessPage!} pageWidthPx={VS01_PACKET_PAGE_WIDTH_PT} />,
    );
    const witnessRendered = renderedCanonicalTextLines(witnessDom.container);
    assertSigningCapacityWitnessLines(witnessRendered, "witness page DOM");
    witnessDom.unmount();
  });
});

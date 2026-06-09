/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import {
  buildVs01SigningPacketModel,
  witnessPageTrailingBlankNorm,
} from "./buildVs01SigningPacketModel";
import { buildFlowLineDescriptors, isCanonicalDocumentTitleLine } from "./vs01CanonicalTextLayout";
import { Vs01CanonicalSigningPage } from "./Vs01CanonicalSigningPage";

const STARTER_735 = `${"Starter preview. ".repeat(40)}`.slice(0, 735);

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test322",
    creatorName: "Blue Canyon Analytics LLC",
    creatorEmail: "owner@example.test",
    ownerSignerName: "Sarah Mitchell",
    ownerSignerTitle: "CEO",
    counterparties: [
      {
        id: "cp1",
        name: "Iron Vale Systems Inc",
        email: "signer@example.test",
        signerName: "Michael Torres",
      },
    ],
  });
}

function consultingCorpus(): string {
  return `MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT

This Agreement governs consulting and implementation services between the parties.

1. SCOPE OF SERVICES
Provider will deliver consulting and implementation services as described in the statement of work.

2. COMPENSATION
Client will pay fees according to the agreed schedule.

${"Operational clause with milestones, acceptance criteria, and change control. ".repeat(28)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Blue Canyon Analytics LLC
By: ______________________
Name: Sarah Mitchell
Title: CEO
Email for Notices: owner@example.test
Address for Notices: 1027 S. Rainbow Blvd., Las Vegas, NV

SERVICE PROVIDER:
Iron Vale Systems Inc
By: ______________________
Name: Michael Torres
Title: President
Email for Notices: signer@example.test
Address for Notices: 12 Reese Ave., Metairie, MS`;
}

function buildModel() {
  return buildVs01SigningPacketModel({
    mode: "guided_pro",
    authoritativeCorpusPlain: consultingCorpus(),
    roles: roles(),
    corpusGateArgs: { freeBaselinePlain: STARTER_735 },
  });
}

describe("TEST322 VS01 canonical polish", () => {
  it("classifies and renders the first-page agreement title as document_title", () => {
    expect(isCanonicalDocumentTitleLine("MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT")).toBe(true);
    const model = buildModel();
    expect(model.allowed).toBe(true);
    const firstPage = model.pages[0]!;
    const descriptors = buildFlowLineDescriptors(firstPage.flowLines, { pageIndex: 0 });
    const titleLine = descriptors.find((line) => line.trimmed.includes("MUTUAL CONSULTING"));
    expect(titleLine?.kind).toBe("document_title");

    const { container } = render(<Vs01CanonicalSigningPage page={firstPage} pageWidthPx={612} />);
    const titleEl = container.querySelector(".vs01-canonical-flow-line--document_title");
    expect(titleEl).toBeTruthy();
    expect(titleEl?.textContent).toMatch(/MUTUAL CONSULTING AND IMPLEMENTATION AGREEMENT/i);
  });

  it("keeps witness page bottom blank within configured margin without initials band reservation", () => {
    const model = buildModel();
    const witnessPage = model.pages.find((p) =>
      p.flowLines.some((line) => /\bIN WITNESS WHEREOF\b/i.test(line)),
    );
    expect(witnessPage).toBeTruthy();
    expect(witnessPage!.initialsBandRect.height).toBeLessThan(0.001);
    expect(witnessPageTrailingBlankNorm(witnessPage!)).toBeLessThan(0.012);

    const bodyPage = model.pages.find((p) => p.pageIndex !== witnessPage!.pageIndex)!;
    expect(bodyPage.initialsBandRect.height).toBeGreaterThan(0.05);
    expect(model.fields.filter((f) => f.type === "initials" && f.page === witnessPage!.pageIndex)).toHaveLength(
      0,
    );
    expect(model.fields.filter((f) => f.type === "signature").length).toBeGreaterThanOrEqual(2);
  });
});

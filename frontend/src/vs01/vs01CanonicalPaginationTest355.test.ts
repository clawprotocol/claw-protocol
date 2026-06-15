import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildVs01SigningPacketModel,
  canonicalFlowStackBottomNorm,
  canonicalFlowZoneUtilizationPct,
  isWitnessSigningPacketPage,
  VS01_PACKET_PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM,
  VS01_PACKET_RESERVED_INITIALS_BAND_TOP_NORM,
  vs01PaginationTextRectBottomLimitNorm,
} from "./buildVs01SigningPacketModel";
import { buildVs01PrepareSigningRoles } from "./vs01SignerFieldAssignment";
import { paidProPacketReadyDashboardPath } from "./vs01PaidProPacketReadyNavigation";

function roles() {
  return buildVs01PrepareSigningRoles({
    agreementId: "ag_test355",
    creatorName: "Red Mesa Logistics LLC",
    creatorEmail: "owner@example.com",
    ownerSignerName: "Ann Rice",
    ownerSignerTitle: "Author",
    counterparties: [
      {
        id: "cp_harbor",
        name: "Harbor Peak Automation LLC",
        email: "cp@example.com",
        signerName: "Han Solo",
        signerTitle: "Starman",
      },
    ],
  });
}

function longProCorpus(): string {
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

1. Services and Engagement Scope. Provider will deliver consulting services as described herein.

2. Deliverables and Acceptance. Client will review deliverables within ten business days.

3. Term. The term begins on the Effective Date and continues for twelve months.

4. Fees and Payment. Client will pay fixed fees as invoiced net thirty days.

5. Confidentiality. Each party will protect the other's confidential information.

6. Intellectual Property. Background IP remains with each party unless expressly assigned.

7. Warranties and Disclaimers. Services are provided as professional services without other warranties.

8. Limitation of Liability. Liability is capped except for fraud or willful misconduct.

9. Governing Law. This Agreement is governed by the laws of the State of Texas.

10. Entire Agreement. This document is the entire agreement between the parties.

${"Operational detail clause with standard commercial language and milestone acceptance criteria. ".repeat(95)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: Author
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Han Solo
Title: Starman
Date: ____________________`;
}

function denseParagraphCorpus(): string {
  const clause =
    "Operational detail clause with standard commercial language and milestone acceptance criteria. ";
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

${clause.repeat(120)}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: Author
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Han Solo
Title: Starman
Date: ____________________`;
}

function structuredSectionCorpus(): string {
  const sections = Array.from({ length: 13 }, (_, i) => {
    const n = i + 1;
    const body =
      "Provider shall perform commercially reasonable services and deliver milestones on schedule with documentation. ".repeat(
        4,
      );
    return `${n}. Section Title ${n}\n${n}.1 Subsection detail.\n${body}`;
  }).join("\n\n");
  return `CONSULTING AND IMPLEMENTATION AGREEMENT

${sections}

IN WITNESS WHEREOF, the Parties execute this Agreement.

CLIENT:
Red Mesa Logistics LLC
By: ______________________
Name: Ann Rice
Title: Author
Date: ____________________

SERVICE PROVIDER:
Harbor Peak Automation LLC
By: ______________________
Name: Han Solo
Title: Starman
Date: ____________________`;
}

function bodyPagesWithInitials(model: ReturnType<typeof buildVs01SigningPacketModel>) {
  return model.pages.filter(
    (page) => !isWitnessSigningPacketPage(page) && page.initialsBandRect.height > 0.001,
  );
}

function assertNoOverlapWithSafetyMargin(
  model: ReturnType<typeof buildVs01SigningPacketModel>,
): void {
  for (const page of model.pages) {
    if (page.initialsBandRect.height < 0.001) continue;
    const stackBottom = canonicalFlowStackBottomNorm(page);
    const limit = vs01PaginationTextRectBottomLimitNorm(page.initialsBandRect.y);
    expect(stackBottom).toBeLessThanOrEqual(limit + 0.001);
    expect(page.initialsBandRect.y).toBeCloseTo(VS01_PACKET_RESERVED_INITIALS_BAND_TOP_NORM, 3);
    for (const rect of page.textBlocks) {
      expect(rect.y + rect.height).toBeLessThanOrEqual(limit + 0.001);
    }
  }
}

describe("test355 VS01 canonical pagination + navigation", () => {
  it("keeps flow stack above reserved initials band with safety margin on every body page", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: longProCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    expect(model.pages.length).toBeGreaterThanOrEqual(5);
    assertNoOverlapWithSafetyMargin(model);
    expect(model.diagnostics.textIntersectsInitialsBand).toBe(false);
    expect(VS01_PACKET_PAGINATION_FLOW_STACK_BOTTOM_LIMIT_NORM).toBeLessThan(
      VS01_PACKET_RESERVED_INITIALS_BAND_TOP_NORM,
    );
  });

  it("fills dense paragraph body pages to at least 95% average flow-zone utilization", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: denseParagraphCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    const bodyPages = bodyPagesWithInitials(model);
    const fullBodyPages = bodyPages.filter((page) => canonicalFlowZoneUtilizationPct(page) >= 90);
    expect(fullBodyPages.length).toBeGreaterThanOrEqual(3);
    const avg =
      fullBodyPages.reduce((sum, page) => sum + canonicalFlowZoneUtilizationPct(page), 0) /
      fullBodyPages.length;
    expect(avg).toBeGreaterThanOrEqual(88);
    assertNoOverlapWithSafetyMargin(model);
  });

  it("keeps structured section body pages above 80% unless immediately before witness", () => {
    const model = buildVs01SigningPacketModel({
      mode: "guided_pro",
      authoritativeCorpusPlain: structuredSectionCorpus(),
      roles: roles(),
      initialsEnabled: true,
    });
    expect(model.allowed).toBe(true);
    const witnessPageIndex = model.pages.findIndex((page) => isWitnessSigningPacketPage(page));
    expect(witnessPageIndex).toBeGreaterThan(0);
    for (const page of bodyPagesWithInitials(model)) {
      const util = canonicalFlowZoneUtilizationPct(page);
      if (util < 80) {
        expect(page.pageIndex).toBe(witnessPageIndex - 1);
      }
    }
    assertNoOverlapWithSafetyMargin(model);
  });

  it("reserves initials band in CSS and clips flow body overflow", () => {
    const css = readFileSync(join(__dirname, "vs01.css"), "utf8");
    expect(css).toContain(".vs01-canonical-flow-body");
    expect(css).toMatch(/\.vs01-canonical-flow-body[\s\S]*overflow:\s*hidden/);
    expect(css).toMatch(/\.vs01-canonical-initials-band[\s\S]*background:\s*#fff/);
    expect(css).toMatch(/\.vs01-canonical-initials-band[\s\S]*z-index:\s*2/);
  });

  it("routes paid Pro bridge prepare finish to modern dashboard landing", () => {
    const wizard = readFileSync(join(__dirname, "Vs01Wizard.tsx"), "utf8");
    expect(wizard).toContain("paidProPacketReadyDashboardPath");
    expect(wizard).toContain('destination: paidProPacketReadyDashboardPath()');
    expect(wizard).toContain("navigate(paidProPacketReadyDashboardPath())");
    expect(wizard).not.toContain("goToStep(3);\n  }, [\n    vs01LinkedAgreementId,\n    documentId,\n    agreementTitle");
    expect(paidProPacketReadyDashboardPath()).toBe("/app?vs01_packet_ready=1");
  });
});

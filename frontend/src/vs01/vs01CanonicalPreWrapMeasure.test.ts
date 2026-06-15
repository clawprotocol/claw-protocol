/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { splitInlineNumberedSectionMarkerFromLine } from "../components/agreements/documentSectionHeadingSplit";
import { buildFlowLineDescriptors } from "./vs01CanonicalTextLayout";
import {
  canonicalContentWidthPx,
  canonicalDescriptorDomHeightUnits,
  measureCanonicalPreWrapVisualLineCount,
} from "./vs01CanonicalPreWrapMeasure";
import { canonicalDescriptorDomStackUnits } from "./vs01CanonicalPageLayoutContract";

const CLAUSE =
  "Service Provider shall perform commercially reasonable services, maintain documentation, deliver milestones on schedule, and support Client acceptance testing.";

describe("vs01CanonicalPreWrapMeasure", () => {
  it("counts fewer visual lines than the legacy char/72 heuristic for typical corpus clauses", () => {
    const width = canonicalContentWidthPx();
    const canvasLines = measureCanonicalPreWrapVisualLineCount(CLAUSE, width, {
      fontSizePx: 13,
      fontWeight: 400,
      fontFamily: 'Georgia, "Times New Roman", serif',
    });
    const legacyLines = Math.max(1, Math.ceil(CLAUSE.length / 72));
    expect(canvasLines).toBeLessThan(legacyLines);
    expect(canvasLines).toBe(2);
  });

  it("splits inline subsection markers into separate render descriptors", () => {
    const glued =
      "support Client acceptance testing. 1.2 Operational terms and cooperation.";
    expect(splitInlineNumberedSectionMarkerFromLine(glued)).toBe(
      "support Client acceptance testing.\n1.2 Operational terms and cooperation.",
    );
    const descriptors = buildFlowLineDescriptors([glued]);
    expect(descriptors).toHaveLength(2);
    expect(descriptors[0]?.trimmed).toBe("support Client acceptance testing.");
    expect(descriptors[1]?.trimmed).toBe("1.2 Operational terms and cooperation.");
    expect(descriptors[1]?.kind).toBe("heading");
  });

  it("maps descriptor stack units to measured height units for body and title kinds", () => {
    const body = buildFlowLineDescriptors([CLAUSE])[0]!;
    const title = buildFlowLineDescriptors(["CONSULTING AND IMPLEMENTATION AGREEMENT"], {
      pageIndex: 0,
    })[0]!;
    expect(canonicalDescriptorDomStackUnits(body)).toBe(canonicalDescriptorDomHeightUnits(body));
    expect(canonicalDescriptorDomStackUnits(title)).toBe(canonicalDescriptorDomHeightUnits(title));
  });
});

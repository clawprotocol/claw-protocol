import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReviewChangeLedgerPanel } from "./ReviewChangeLedgerPanel";
import type { ReviewChangeLedger } from "../../agreement/reviewChangeLedger";

describe("ReviewChangeLedgerPanel", () => {
  it("renders a summary with counts and risk tags for ledger entries", () => {
    const ledger: ReviewChangeLedger = {
      entries: [
        {
          id: "x1",
          type: "changed",
          sectionHeading: "FEES",
          beforeText: "Fee $1",
          afterText: "Fee $2",
          riskTags: ["payment", "general"],
        },
      ],
      truncated: false,
      stats: { added: 0, removed: 0, changed: 1 },
    };
    const html = renderToStaticMarkup(<ReviewChangeLedgerPanel ledger={ledger} />);
    expect(html).toContain("Changes detected");
    expect(html).toContain("changed");
    expect(html).toContain("payment");
    expect(html).toContain("Fee $1");
    expect(html).toContain("Fee $2");
  });

  it("renders empty-state copy when there are no entries", () => {
    const ledger: ReviewChangeLedger = {
      entries: [],
      truncated: false,
      stats: { added: 0, removed: 0, changed: 0 },
    };
    const html = renderToStaticMarkup(<ReviewChangeLedgerPanel ledger={ledger} />);
    expect(html).toContain("No paragraph-level text changes detected");
  });
});

/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildLegalRedlineDocumentViewModel } from "./legalRedlineBlocks";
import { applyRecipientMeaningfulChangePass } from "./recipientMeaningfulRedlinePass";
import {
  openAncestorDetailsWithin,
  resolveRecipientSemanticScrollTarget,
  scrollRecipientRedlineAnchor,
  scrollRecipientRedlineClausePanel,
} from "./recipientRedlineDomScroll";

describe("recipientRedlineDomScroll", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("openAncestorDetailsWithin opens only details ancestors inside the boundary", () => {
    document.body.innerHTML = `
      <details id="outside"><summary>outside</summary>
        <div id="boundary">
          <details id="mid"><summary>mid</summary>
            <details id="inner"><summary>inner</summary>
              <div id="target">x</div>
            </details>
          </details>
        </div>
      </details>`;
    const boundary = document.getElementById("boundary") as HTMLElement;
    const target = document.getElementById("target") as HTMLElement;
    const outside = document.getElementById("outside") as HTMLDetailsElement;
    const mid = document.getElementById("mid") as HTMLDetailsElement;
    const inner = document.getElementById("inner") as HTMLDetailsElement;
    outside.open = false;
    mid.open = false;
    inner.open = false;
    openAncestorDetailsWithin(target, boundary);
    expect(mid.open).toBe(true);
    expect(inner.open).toBe(true);
    expect(outside.open).toBe(false);
  });

  it("scrollRecipientRedlineAnchor opens nested details and returns the anchored section", () => {
    document.body.innerHTML = `
      <div id="shell" style="height:120px;overflow:auto">
        <details id="outer"><summary>o</summary>
          <div data-recipient-semantic-anchor="semantic-pay" id="hit" style="height:400px">clause</div>
        </details>
      </div>`;
    const shell = document.getElementById("shell") as HTMLElement;
    const outer = document.getElementById("outer") as HTMLDetailsElement;
    outer.open = false;
    const el = scrollRecipientRedlineAnchor({
      root: shell,
      detailsBoundary: shell,
      anchorValue: "semantic-pay",
      anchorAttribute: "data-recipient-semantic-anchor",
    });
    expect(outer.open).toBe(true);
    expect(el?.id).toBe("hit");
  });

  it("resolveRecipientSemanticScrollTarget matches centralized scroll resolver output", () => {
    const vm = applyRecipientMeaningfulChangePass(
      buildLegalRedlineDocumentViewModel(
        "4. Payment\nFees are due on receipt within five business days.",
        "4. Payment\nFees are Net 30 from the invoice date.",
      ),
    );
    const r = resolveRecipientSemanticScrollTarget(vm, "payment_terms");
    expect(r.blockId).toBeTruthy();
    expect(r.semanticAnchorId).toBeTruthy();
    expect(r.semanticAnchorId).toMatch(/^semantic-/);
  });

  it("scrollRecipientRedlineClausePanel falls back to data-block-id and invokes highlight", async () => {
    document.body.innerHTML = `
      <div id="shell" style="height:100px;overflow:auto">
        <details id="outer"><summary>o</summary>
          <section data-block-id="blk-1" data-recipient-semantic-anchor="semantic-wrong">here</section>
        </details>
      </div>`;
    const shell = document.getElementById("shell") as HTMLElement;
    (document.getElementById("outer") as HTMLDetailsElement).open = false;
    const highlights: (string | null)[] = [];
    const result = await scrollRecipientRedlineClausePanel({
      root: shell,
      detailsBoundary: shell,
      semanticAnchorId: "semantic-missing",
      blockId: "blk-1",
      onHighlight: (id) => highlights.push(id),
      highlightClearMs: 50,
    });
    expect(result.hit?.getAttribute("data-block-id")).toBe("blk-1");
    expect(result.matchedBy).toBe("block");
    expect(result.attempts).toBeGreaterThan(0);
    expect(highlights.some((h) => h === "semantic-missing")).toBe(true);
  });
});

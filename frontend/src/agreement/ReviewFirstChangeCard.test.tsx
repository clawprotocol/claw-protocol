/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ReviewFirstChangeCard } from "./ReviewFirstChangeCard";
import { buildReviewFirstTextDiffSummary } from "./reviewFirstTextDiff";

const INVOICING_PAYMENT_AGREEMENT = [
  "3.2 Invoicing and Payment Timing",
  "Client shall pay each undisputed invoice within thirty (30) days after receipt of invoice.",
].join("\n");

function renderPaymentTimingCard() {
  const proposed = INVOICING_PAYMENT_AGREEMENT.replace(
    "within thirty (30) days after receipt",
    "within fifteen (15) days after receipt",
  );
  const section = buildReviewFirstTextDiffSummary(INVOICING_PAYMENT_AGREEMENT, proposed).changedSections[0]!;
  const container = document.createElement("div");
  container.style.width = "375px";
  container.style.maxWidth = "375px";
  document.body.appendChild(container);
  render(<ReviewFirstChangeCard section={section} />, { container });
  return section;
}

describe("ReviewFirstChangeCard", () => {
  afterEach(() => cleanup());

  it("shows payment timing delta with clause label at 375px without opening details", () => {
    const section = renderPaymentTimingCard();

    expect(screen.getByTestId("recipient-review-first-change-title").textContent).toContain("Payment timing changed");
    expect(screen.getByTestId("recipient-review-first-before-phrase").textContent).toContain("thirty (30) days after receipt");
    expect(screen.getByTestId("recipient-review-first-after-phrase").textContent).toContain("fifteen (15) days after receipt");
    expect(screen.getByTestId("recipient-review-first-clause-label").textContent).toContain(
      "3.2 Invoicing and Payment Timing",
    );
    expect(section.beforePhrase).toContain("thirty (30) days after receipt");
    expect(section.afterPhrase).toContain("fifteen (15) days after receipt");
    expect(section.changeMagnitude).toBe("phrase");

    const phraseDelta = screen.getByTestId("recipient-review-first-phrase-delta");
    const card = screen.getByTestId("recipient-review-first-change-card");
    expect(card.getAttribute("data-change-magnitude")).toBe("phrase");

    const clauseContext = screen.getByTestId("recipient-review-first-clause-context");
    expect(clauseContext.hasAttribute("open")).toBe(false);

    expect(phraseDelta.textContent).not.toMatch(/Ownership/i);
    expect(phraseDelta.textContent).not.toMatch(/Parties/i);
    expect(phraseDelta.textContent).not.toMatch(/Effective/i);

    const rootWidth = card.getBoundingClientRect().width;
    expect(rootWidth).toBeLessThanOrEqual(375);
    expect(phraseDelta.textContent).toMatch(/thirty \(30\) days after receipt/i);
    expect(phraseDelta.textContent).toMatch(/fifteen \(15\) days after receipt/i);
  });

  it("emphasizes only changed tokens in phrase redline", () => {
    renderPaymentTimingCard();
    const before = screen.getByTestId("recipient-review-first-before-phrase");
    const after = screen.getByTestId("recipient-review-first-after-phrase");
    expect(before.querySelector(".bg-rose-100")?.textContent).toMatch(/thirty|\(30\)/);
    expect(after.querySelector(".bg-emerald-100")?.textContent).toMatch(/fifteen|\(15\)/);
  });
});

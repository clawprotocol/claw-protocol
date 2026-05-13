/** @vitest-environment jsdom */
/**
 * Focused render regression for the inline starter party-count notice.
 *
 * Covers the Railway QA gaps:
 *   • P0 — 7-party drafts must visibly mount the caution notice in the rendered DOM,
 *          with the correct copy, role, and test id (no fixed-position dependency).
 *   • P0 — 12-party drafts also produce the caution notice (upper bound of the tier).
 *   • P0 — 6-party drafts produce no notice at all (lower bound — must never false-positive).
 *   • P1 — 13+ drafts must visibly mount the explicit Pro-required title + body, with
 *          alert role, and must NOT contain any banned internal-process language.
 *   • P3 — Light E2E (component-level) coverage of the notice rendered for 6 / 7 / 13
 *          party guard payloads as derived from `resolveStarterPartyCountGuard`.
 *   • Hydration survival — re-render with the same status keeps the same DOM node text.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

import { StarterPartyCountNotice } from "./StarterPartyCountNotice";
import {
  STARTER_PARTY_CAUTION_NOTICE,
  STARTER_PARTY_PRO_REQUIRED_CTA_LABEL,
  STARTER_PARTY_PRO_REQUIRED_NOTICE,
  STARTER_PARTY_PRO_REQUIRED_TITLE,
  resolveStarterPartyCountGuard,
} from "./starterPartyLimits";

const realParties = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ name: `Atlas ${i + 1} LLC` }));

afterEach(() => cleanup());

describe("StarterPartyCountNotice — rendering by status", () => {
  it("renders nothing for status='normal' (1–6 real parties)", () => {
    const { container } = render(<StarterPartyCountNotice status="normal" />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId("starter-party-count-caution")).toBeNull();
    expect(screen.queryByTestId("starter-party-count-pro-required")).toBeNull();
  });

  it("renders the caution notice with correct DOM attrs for 7-party drafts", () => {
    render(<StarterPartyCountNotice status="caution" />);
    const node = screen.getByTestId("starter-party-count-caution");
    expect(node).toBeTruthy();
    expect(node.getAttribute("role")).toBe("status");
    expect(node.getAttribute("aria-live")).toBe("polite");
    expect(node.textContent).toContain(STARTER_PARTY_CAUTION_NOTICE);
  });

  it("renders the Pro-required title + body and uses role='alert' for 13+ parties", () => {
    render(<StarterPartyCountNotice status="requires_pro" />);
    const node = screen.getByTestId("starter-party-count-pro-required");
    expect(node).toBeTruthy();
    expect(node.getAttribute("role")).toBe("alert");
    expect(node.textContent).toContain(STARTER_PARTY_PRO_REQUIRED_TITLE);
    expect(node.textContent).toContain(STARTER_PARTY_PRO_REQUIRED_NOTICE);
    expect(node.textContent).toContain("13 or more parties");
    expect(node.textContent).toContain("LawDog Pro");
  });

  it("supports a 'sticky' surface variant with disambiguating test id", () => {
    render(<StarterPartyCountNotice status="caution" surface="sticky" />);
    expect(screen.getByTestId("starter-party-count-caution-sticky")).toBeTruthy();
  });

  it("Pro-required notice contains no banned internal-process language", () => {
    render(<StarterPartyCountNotice status="requires_pro" />);
    const node = screen.getByTestId("starter-party-count-pro-required");
    const banned = /\b(?:parser|fallback|shell|internal|hard\s+cut|algorithm|threshold\s+logic)\b/i;
    expect(node.textContent).not.toMatch(banned);
  });
});

describe("StarterPartyCountNotice — wired against resolveStarterPartyCountGuard (P3 light E2E)", () => {
  it("6 real parties → no notice rendered", () => {
    const guard = resolveStarterPartyCountGuard(realParties(6));
    const { container } = render(<StarterPartyCountNotice status={guard.status} />);
    expect(container.firstChild).toBeNull();
  });

  it("7 real parties → caution notice visible with copy and accessible role", () => {
    const guard = resolveStarterPartyCountGuard(realParties(7));
    render(<StarterPartyCountNotice status={guard.status} />);
    const node = screen.getByTestId("starter-party-count-caution");
    expect(node.textContent).toContain(STARTER_PARTY_CAUTION_NOTICE);
    expect(node.getAttribute("role")).toBe("status");
    // CTA-pairing assertion: cautious tier must NOT route to the Pro CTA label.
    expect(guard.requiresProUpgrade).toBe(false);
  });

  it("12 real parties (upper caution boundary) → caution notice visible", () => {
    const guard = resolveStarterPartyCountGuard(realParties(12));
    render(<StarterPartyCountNotice status={guard.status} />);
    expect(screen.getByTestId("starter-party-count-caution").textContent).toContain(
      STARTER_PARTY_CAUTION_NOTICE,
    );
  });

  it("13 real parties → Pro-required explanation visible AND CTA label is 'Continue to LawDog Pro'", () => {
    const guard = resolveStarterPartyCountGuard(realParties(13));
    render(<StarterPartyCountNotice status={guard.status} />);
    const node = screen.getByTestId("starter-party-count-pro-required");
    expect(node.textContent).toContain(STARTER_PARTY_PRO_REQUIRED_TITLE);
    expect(node.textContent).toContain(STARTER_PARTY_PRO_REQUIRED_NOTICE);
    // Routing pair: requires_pro forces the existing Pro upgrade CTA with the new label.
    expect(guard.requiresProUpgrade).toBe(true);
    expect(STARTER_PARTY_PRO_REQUIRED_CTA_LABEL).toBe("Continue to LawDog Pro");
  });

  it("notice survives a hydration-style re-render — DOM text remains stable", () => {
    const { rerender } = render(<StarterPartyCountNotice status="caution" />);
    expect(screen.getByTestId("starter-party-count-caution").textContent).toContain(
      STARTER_PARTY_CAUTION_NOTICE,
    );
    rerender(<StarterPartyCountNotice status="caution" />);
    expect(screen.getByTestId("starter-party-count-caution").textContent).toContain(
      STARTER_PARTY_CAUTION_NOTICE,
    );
  });

  it("status flip caution → requires_pro swaps to the Pro-required block on re-render", () => {
    const { rerender } = render(<StarterPartyCountNotice status="caution" />);
    expect(screen.queryByTestId("starter-party-count-caution")).toBeTruthy();
    rerender(<StarterPartyCountNotice status="requires_pro" />);
    expect(screen.queryByTestId("starter-party-count-caution")).toBeNull();
    expect(screen.getByTestId("starter-party-count-pro-required").textContent).toContain(
      STARTER_PARTY_PRO_REQUIRED_TITLE,
    );
  });
});

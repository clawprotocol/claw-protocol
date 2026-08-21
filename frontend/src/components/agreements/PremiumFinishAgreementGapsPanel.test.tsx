/**
 * @vitest-environment jsdom
 *
 * PremiumFinishAgreementGapsPanel tests.
 *
 * RULES:
 * - Questions come from the LLM API (ask-before-draft / missing-facts)
 * - Questions are SPECIFIC to THIS dump (e.g. "Who is paying the 7% — Harbor or Mesa?")
 * - NOT a canned generic list
 * - NOT a second free-form dump box
 * - One targeted input field per LLM-generated question
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { PremiumFinishAgreementGapsPanel } from "./PremiumFinishAgreementGapsPanel";

afterEach(() => {
  cleanup();
});

describe("PremiumFinishAgreementGapsPanel - LLM-generated questions", () => {
  const defaultProps = {
    questions: [
      "Who is paying the 7% commission — Harbor Pool & Patio LLC or Mesa Realty Group LLC?",
      "What is the geographic scope of the exclusivity clause?",
    ],
    oneField: "",
    onOneField: vi.fn(),
    onContinue: vi.fn(),
    onUseDefaults: vi.fn(),
    onDismiss: vi.fn(),
    continueDisabled: false,
  };

  it("renders LLM-generated questions as labels with targeted input fields", () => {
    render(<PremiumFinishAgreementGapsPanel {...defaultProps} />);

    // Should show the specific LLM-generated questions as labels
    expect(screen.getByText(/Who is paying the 7% commission/)).toBeTruthy();
    expect(screen.getByText(/What is the geographic scope/)).toBeTruthy();

    // Should have one input per question
    const inputs = document.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBe(2);
  });

  it("does NOT have a textarea (no second free-form dump box)", () => {
    render(<PremiumFinishAgreementGapsPanel {...defaultProps} />);

    const textareas = document.querySelectorAll("textarea");
    expect(textareas.length).toBe(0);
  });

  it("shows specific question text, not generic canned labels", () => {
    render(<PremiumFinishAgreementGapsPanel {...defaultProps} />);

    // Should show the ACTUAL question text from the LLM, not generic labels
    const bodyText = document.body.textContent || "";
    expect(bodyText).toContain("Who is paying the 7% commission");
    expect(bodyText).toContain("Harbor Pool & Patio LLC");
    expect(bodyText).toContain("Mesa Realty Group LLC");
    expect(bodyText).toContain("geographic scope");

    // Should NOT have generic canned labels
    expect(bodyText).not.toContain("Please enter party 1");
    expect(bodyText).not.toContain("Enter parties");
  });

  it("shows heading based on number of questions", () => {
    render(<PremiumFinishAgreementGapsPanel {...defaultProps} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("2 quick questions");
  });

  it("shows singular heading for one question", () => {
    const props = {
      ...defaultProps,
      questions: ["Who is the service provider in this referral arrangement?"],
    };
    render(<PremiumFinishAgreementGapsPanel {...props} />);
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("One quick question");
  });

  it("syncs answers to parent oneField in numbered format", () => {
    const onOneField = vi.fn();
    const props = {
      ...defaultProps,
      onOneField,
    };
    render(<PremiumFinishAgreementGapsPanel {...props} />);

    const inputs = document.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: "Harbor pays Mesa" } });

    expect(onOneField).toHaveBeenCalledWith("1. Harbor pays Mesa");

    // Fill second answer
    fireEvent.change(inputs[1], { target: { value: "Phoenix metro area" } });
    expect(onOneField).toHaveBeenLastCalledWith("1. Harbor pays Mesa\n2. Phoenix metro area");
  });

  it("requires at least one answer before Continue is enabled", () => {
    render(<PremiumFinishAgreementGapsPanel {...defaultProps} />);

    const continueButton = screen.getByRole("button", { name: "Continue" });
    expect(continueButton.hasAttribute("disabled")).toBe(true);

    // Fill one answer
    const inputs = document.querySelectorAll('input[type="text"]');
    fireEvent.change(inputs[0], { target: { value: "Harbor pays" } });

    expect(continueButton.hasAttribute("disabled")).toBe(false);
  });

  it("has Use defaults button for quick bypass", () => {
    render(<PremiumFinishAgreementGapsPanel {...defaultProps} />);
    expect(screen.getByRole("button", { name: "Use defaults" })).toBeTruthy();
  });

  it("renders nothing if no questions provided", () => {
    const props = {
      ...defaultProps,
      questions: [],
    };
    const { container } = render(<PremiumFinishAgreementGapsPanel {...props} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("PremiumFinishAgreementGapsPanel - real LLM question examples", () => {
  it("handles Harbor-specific clarification questions", () => {
    const harborQuestions = [
      "The prompt mentions a 7% commission — is this paid by Harbor Pool & Patio LLC to Mesa Realty Group LLC, or the other way around?",
      "You mentioned Phoenix-metro exclusivity with lead minimums — what are the specific minimum lead volume requirements?",
      "The 45-day clawback applies to cancellations — does it also apply to partial refunds or chargebacks?",
    ];
    const props = {
      questions: harborQuestions,
      oneField: "",
      onOneField: vi.fn(),
      onContinue: vi.fn(),
      onUseDefaults: vi.fn(),
      onDismiss: vi.fn(),
      continueDisabled: false,
    };
    render(<PremiumFinishAgreementGapsPanel {...props} />);

    // All Harbor-specific questions should be visible
    expect(screen.getByText(/7% commission/)).toBeTruthy();
    expect(screen.getByText(/Phoenix-metro exclusivity/)).toBeTruthy();
    expect(screen.getByText(/45-day clawback/)).toBeTruthy();

    // Should have 3 input fields
    const inputs = document.querySelectorAll('input[type="text"]');
    expect(inputs.length).toBe(3);

    // Heading should reflect count
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("3 quick questions");
  });

  it("handles contradictory tenet clarification", () => {
    const props = {
      questions: [
        "You mentioned both 'Arizona law' and 'Phoenix jurisdiction' — should this agreement be governed by Arizona state law?",
      ],
      oneField: "",
      onOneField: vi.fn(),
      onContinue: vi.fn(),
      onUseDefaults: vi.fn(),
      onDismiss: vi.fn(),
      continueDisabled: false,
    };
    render(<PremiumFinishAgreementGapsPanel {...props} />);

    // Specific clarification question should be visible
    expect(screen.getByText(/Arizona law.*Phoenix jurisdiction/)).toBeTruthy();
  });
});

/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";
import { PaidProPostPosSignerChrome } from "./PaidProPostPosSignerChrome";

describe("PaidProPostPosSignerChrome", () => {
  const mockOnContinue = vi.fn();

  const defaultProps = {
    parties: [
      { name: "Acme Corp", role: "client" },
      { name: "Harbor Pool & Patio", role: "contractor" },
    ] as const,
    onContinue: mockOnContinue,
  };

  beforeEach(() => {
    mockOnContinue.mockClear();
    cleanup();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders the component", () => {
    const { container, getByText } = render(<PaidProPostPosSignerChrome {...defaultProps} />);
    const component = container.querySelector('[data-testid="paid-pro-post-pos-signer-chrome"]');
    expect(component).toBeTruthy();
    expect(getByText("Acme Corp")).toBeTruthy();
    expect(getByText("Harbor Pool & Patio")).toBeTruthy();
  });

  it("disables Continue button when signer details are incomplete", () => {
    const { container } = render(<PaidProPostPosSignerChrome {...defaultProps} />);
    const component = container.querySelector('[data-testid="paid-pro-post-pos-signer-chrome"]');
    expect(component).toBeTruthy();
    const continueButton = container.querySelector('[data-testid="paid-pro-post-pos-continue"]') as HTMLButtonElement;
    expect(continueButton?.disabled).toBe(true);
  });

  it("enables Continue button when all signers have name and valid email", () => {
    const { container } = render(<PaidProPostPosSignerChrome {...defaultProps} />);
    
    const nameInput0 = container.querySelector('[data-testid="signer-name-input-0"]') as HTMLInputElement;
    const emailInput0 = container.querySelector('[data-testid="signer-email-input-0"]') as HTMLInputElement;
    const nameInput1 = container.querySelector('[data-testid="signer-name-input-1"]') as HTMLInputElement;
    const emailInput1 = container.querySelector('[data-testid="signer-email-input-1"]') as HTMLInputElement;

    fireEvent.change(nameInput0, { target: { value: "John Doe" } });
    fireEvent.change(emailInput0, { target: { value: "john@acme.com" } });
    fireEvent.change(nameInput1, { target: { value: "Jane Smith" } });
    fireEvent.change(emailInput1, { target: { value: "jane@harbor.com" } });

    const continueButton = container.querySelector('[data-testid="paid-pro-post-pos-continue"]') as HTMLButtonElement;
    expect(continueButton?.disabled).toBe(false);
  });

  it("calls onContinue with signer data when Continue is clicked", () => {
    const { container } = render(<PaidProPostPosSignerChrome {...defaultProps} />);
    
    const nameInput0 = container.querySelector('[data-testid="signer-name-input-0"]') as HTMLInputElement;
    const emailInput0 = container.querySelector('[data-testid="signer-email-input-0"]') as HTMLInputElement;
    const nameInput1 = container.querySelector('[data-testid="signer-name-input-1"]') as HTMLInputElement;
    const emailInput1 = container.querySelector('[data-testid="signer-email-input-1"]') as HTMLInputElement;

    fireEvent.change(nameInput0, { target: { value: "John Doe" } });
    fireEvent.change(emailInput0, { target: { value: "john@acme.com" } });
    fireEvent.change(nameInput1, { target: { value: "Jane Smith" } });
    fireEvent.change(emailInput1, { target: { value: "jane@harbor.com" } });

    const continueButton = container.querySelector('[data-testid="paid-pro-post-pos-continue"]') as HTMLButtonElement;
    fireEvent.click(continueButton);

    expect(mockOnContinue).toHaveBeenCalledWith([
      {
        partyName: "Acme Corp",
        signerName: "John Doe",
        signerEmail: "john@acme.com",
        signerTitle: "",
      },
      {
        partyName: "Harbor Pool & Patio",
        signerName: "Jane Smith",
        signerEmail: "jane@harbor.com",
        signerTitle: "",
      },
    ]);
  });

  it("validates email format", () => {
    const { container } = render(<PaidProPostPosSignerChrome {...defaultProps} />);
    
    const nameInput0 = container.querySelector('[data-testid="signer-name-input-0"]') as HTMLInputElement;
    const emailInput0 = container.querySelector('[data-testid="signer-email-input-0"]') as HTMLInputElement;
    const nameInput1 = container.querySelector('[data-testid="signer-name-input-1"]') as HTMLInputElement;
    const emailInput1 = container.querySelector('[data-testid="signer-email-input-1"]') as HTMLInputElement;

    fireEvent.change(nameInput0, { target: { value: "John Doe" } });
    fireEvent.change(emailInput0, { target: { value: "invalid-email" } });
    fireEvent.change(nameInput1, { target: { value: "Jane Smith" } });
    fireEvent.change(emailInput1, { target: { value: "jane@harbor.com" } });

    const continueButton = container.querySelector('[data-testid="paid-pro-post-pos-continue"]') as HTMLButtonElement;
    expect(continueButton?.disabled).toBe(true);
  });

  it("shows busy state when continueBusy is true", () => {
    const { getByText } = render(
      <PaidProPostPosSignerChrome {...defaultProps} continueBusy={true} />
    );
    expect(getByText("Preparing…")).toBeTruthy();
  });
});

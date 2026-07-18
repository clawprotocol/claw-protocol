import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getFragmentBootstrapMetadata,
  isVs01EmailLinkBootstrapSurface,
  resetFragmentBootstrapTokenMemoForTests,
  takeFragmentBootstrapTokenOnce,
} from "./vs01FragmentBootstrapToken";

describe("vs01FragmentBootstrapToken", () => {
  afterEach(() => {
    resetFragmentBootstrapTokenMemoForTests();
    vi.unstubAllGlobals();
  });

  it("hands off the fragment token once and clears reusable plaintext state", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/app/esign/doc_abc",
        search: "?vs01_recipient_sign=1",
        hash: "#t=bootstrap-token-value",
      },
      history: { replaceState: vi.fn() },
    });
    const first = takeFragmentBootstrapTokenOnce();
    expect(first).toBe("bootstrap-token-value");
    expect(window.history.replaceState).toHaveBeenCalledWith(
      {},
      "",
      "/app/esign/doc_abc?vs01_recipient_sign=1",
    );
    expect(takeFragmentBootstrapTokenOnce()).toBeNull();
    expect(takeFragmentBootstrapTokenOnce()).toBeNull();
    expect(getFragmentBootstrapMetadata()?.hadFragmentToken).toBe(true);
    expect(getFragmentBootstrapMetadata()?.fragmentRemoved).toBe(true);
  });

  it("StrictMode-style double acquisition cannot recover plaintext token", () => {
    vi.stubGlobal("window", {
      location: {
        pathname: "/app/esign/doc_abc",
        search: "?vs01_recipient_sign=1",
        hash: "#t=strict-mode-token",
      },
      history: { replaceState: vi.fn() },
    });
    const first = takeFragmentBootstrapTokenOnce();
    const second = takeFragmentBootstrapTokenOnce();
    expect(first).toBe("strict-mode-token");
    expect(second).toBeNull();
  });

  it("identifies email-link bootstrap surface without legacy query bootstrap", () => {
    expect(
      isVs01EmailLinkBootstrapSurface(
        "/app/esign/doc_abc",
        "?vs01_recipient_sign=1",
      ),
    ).toBe(true);
    expect(
      isVs01EmailLinkBootstrapSurface(
        "/app/esign/doc_abc",
        "?vs01_recipient_sign=1&document_id=doc_abc&recipient_index=0",
      ),
    ).toBe(false);
  });
});

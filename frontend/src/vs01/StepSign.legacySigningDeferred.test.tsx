/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StepSign } from "./StepSign";
import {
  LEGACY_SIGNING_DEFERRED_DETAIL,
  LEGACY_SIGNING_UNAVAILABLE_MESSAGE,
} from "./vs01Api";

describe("StepSign deferred legacy signing state", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("disables signing without success state or retry after the exact deferred response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ detail: LEGACY_SIGNING_DEFERRED_DETAIL }), {
        status: 409,
        headers: { "Content-Type": "application/json" },
      })
    );
    const onError = vi.fn();
    const onSigned = vi.fn();
    const onContinue = vi.fn();
    const storageWrite = vi.spyOn(Storage.prototype, "setItem");

    const view = render(
      <StepSign
        documentId="doc-1"
        contentSha256={"ab".repeat(32)}
        receiptId={null}
        loading="idle"
        setLoading={vi.fn()}
        onError={onError}
        onSigned={onSigned}
        onContinue={onContinue}
      />
    );

    const signingCta = view.getByRole("button", { name: "Create session & sign" });
    fireEvent.click(signingCta);

    await waitFor(() => {
      expect(onError).toHaveBeenLastCalledWith(LEGACY_SIGNING_UNAVAILABLE_MESSAGE);
      expect((signingCta as HTMLButtonElement).disabled).toBe(true);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(onSigned).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(
      (view.getByRole("button", { name: "Continue to done" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(onContinue).not.toHaveBeenCalled();
    expect(view.getByRole("status").textContent).toBe(LEGACY_SIGNING_UNAVAILABLE_MESSAGE);
  });
});

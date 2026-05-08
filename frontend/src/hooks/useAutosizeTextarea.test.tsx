/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { useRef } from "react";
import { useAutosizeTextarea } from "./useAutosizeTextarea";

function AutosizeBox({ value }: { value: string }) {
  const r = useRef<HTMLTextAreaElement>(null);
  useAutosizeTextarea(r, value, { minPx: 60, maxPx: 300 });
  return <textarea ref={r} readOnly value={value} />;
}

describe("useAutosizeTextarea", () => {
  it("caps textarea height at maxPx when scrollHeight exceeds cap", () => {
    const { rerender } = render(<AutosizeBox value="short" />);
    const el = screen.getByRole("textbox");
    vi.spyOn(el, "scrollHeight", "get").mockReturnValue(900);
    rerender(<AutosizeBox value={"longer\n".repeat(30)} />);
    expect(el.style.height).toBe("300px");
    expect(el.style.overflowY).toBe("auto");
  });
});

/** @vitest-environment jsdom */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { LawdogBrand } from "./LawdogBrand";

describe("LawdogBrand", () => {
  it("renders a vector emblem (not a filtered PNG) on dark surfaces", () => {
    const { container } = render(<LawdogBrand variant="wordmark" size="md" surface="dark" />);
    expect(container.querySelector("svg")).toBeTruthy();
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector(".brightness-0")).toBeNull();
    expect(screen.getByText("LawDog")).toBeTruthy();
  });

  it("tints via currentColor classes for light vs dark", () => {
    const { container: dark } = render(<LawdogBrand variant="emblem" size="sm" surface="dark" />);
    const { container: light } = render(<LawdogBrand variant="emblem" size="sm" surface="light" />);
    expect(dark.firstElementChild?.className).toMatch(/text-slate-100/);
    expect(light.firstElementChild?.className).toMatch(/text-slate-900/);
  });
});

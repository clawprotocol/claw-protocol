/** @vitest-environment jsdom */
import { describe, expect, it, beforeEach } from "vitest";
import {
  readVs01SigningPackagePreferences,
  writeVs01SigningPackagePreferences,
} from "./vs01SigningPackagePreferences";

describe("vs01SigningPackagePreferences", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("persists initials preference across refresh", () => {
    writeVs01SigningPackagePreferences("ag_pref", { autoInitialsEveryPage: true });
    expect(readVs01SigningPackagePreferences("ag_pref")?.autoInitialsEveryPage).toBe(true);
    writeVs01SigningPackagePreferences("ag_pref", { autoInitialsEveryPage: false });
    expect(readVs01SigningPackagePreferences("ag_pref")?.autoInitialsEveryPage).toBe(false);
  });
});

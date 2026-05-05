/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { VoiceAugmentedTextArea } from "../launch/VoiceAugmentedControl";

describe("recipient revision voice field", () => {
  afterEach(() => cleanup());

  it("exposes dictation control on the recipient-style notes field", () => {
    render(
      <VoiceAugmentedTextArea
        id="recipient-revision-input"
        data-testid="recipient-revision-voice-field"
        value=""
        onValueChange={() => {}}
        className="pb-11 pr-12"
        surface="dark"
        voiceSubtleIdle={false}
        voiceUiEnabled
      />,
    );
    expect(screen.getByTestId("recipient-revision-voice-field")).toBeTruthy();
    expect(
      screen.getByRole("button", {
        name: /Start voice input|Dictation not supported in this browser/i,
      }),
    ).toBeTruthy();
  });
});

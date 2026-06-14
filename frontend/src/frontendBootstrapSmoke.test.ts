import { describe, expect, it } from "vitest";
import { paidProPacketReadyDashboardPath } from "./vs01/vs01PaidProPacketReadyNavigation";

describe("frontend bootstrap smoke", () => {
  it("imports ClawProductApp without initialization errors", async () => {
    const mod = await import("./ClawProductApp");
    expect(typeof mod.ClawProductApp).toBe("function");
  });

  it("imports VS01 signing packet model without circular dependency errors", async () => {
    const mod = await import("./vs01/buildVs01SigningPacketModel");
    expect(mod.VS01_PACKET_PAGE_WIDTH_PT).toBe(612);
    expect(mod.VS01_PACKET_PAGE_HEIGHT_PT).toBe(792);
    expect(typeof mod.buildVs01SigningPacketModel).toBe("function");
  });

  it("imports VS01 visual constants after packet layout constants", async () => {
    const mod = await import("./vs01/vs01VisualConstants");
    expect(mod.VS01_VISUAL_PAGE_WIDTH_PT).toBe(612);
    expect(mod.VS01_EXECUTION_SPACER_FRAC).toBe(0.55);
  });

  it("returns modern dashboard path after packet-ready handoff", () => {
    expect(paidProPacketReadyDashboardPath()).toBe("/app?vs01_packet_ready=1");
  });
});

/**
 * StrictMode-safe single in-flight recipient session packet load.
 */

import {
  fetchRecipientSessionPacket,
  type RecipientSessionPacketResult,
} from "./recipientSessionPacketApi";

let inFlightLoad: Promise<RecipientSessionPacketResult> | null = null;
let loadEpoch = 0;

export function beginRecipientSessionPacketLoad(): {
  epoch: number;
  promise: Promise<RecipientSessionPacketResult>;
} {
  const epoch = loadEpoch;
  if (!inFlightLoad) {
    const loadPromise = fetchRecipientSessionPacket();
    inFlightLoad = loadPromise;
    void loadPromise.finally(() => {
      if (inFlightLoad === loadPromise) {
        inFlightLoad = null;
      }
    });
  }
  return { epoch, promise: inFlightLoad };
}

export function invalidateRecipientSessionPacketLoads(): void {
  loadEpoch += 1;
  inFlightLoad = null;
}

export function isRecipientSessionPacketLoadCurrent(epoch: number): boolean {
  return epoch === loadEpoch;
}

export function resetRecipientSessionPacketLoadForTests(): void {
  loadEpoch = 0;
  inFlightLoad = null;
}

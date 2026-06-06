/**
 * Paid Pro first-review signature preparation UI telemetry (Test294).
 */

const prepCtaVisibleLogKeys = new Set<string>();
const prepSelectedLogKeys = new Set<string>();
const signerFieldsMountedLogKeys = new Set<string>();
const signerFieldsReadyLogKeys = new Set<string>();

export function resetPaidProSignaturePrepUiLogsForTests(): void {
  prepCtaVisibleLogKeys.clear();
  prepSelectedLogKeys.clear();
  signerFieldsMountedLogKeys.clear();
  signerFieldsReadyLogKeys.clear();
}

export function logPaidProSignaturePrepCtaVisible(payload: {
  reviewCtaVisible: boolean;
  prepareSignaturesCtaVisible: boolean;
  signerFieldsMounted: boolean;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.reviewCtaVisible}|${payload.prepareSignaturesCtaVisible}|${payload.signerFieldsMounted}`;
  if (prepCtaVisibleLogKeys.has(key)) return;
  prepCtaVisibleLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signature-prep-cta-visible]", payload);
}

export function logPaidProSignaturePrepSelected(payload: {
  source: string;
  selectedTrack: "signature";
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.source}|${payload.selectedTrack}`;
  if (prepSelectedLogKeys.has(key)) return;
  prepSelectedLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signature-prep-selected]", payload);
}

export function logPaidProSignerFieldsMounted(payload: {
  partySlotCount: number;
  slotsWithSignerName: number;
  slotsWithSignerTitle: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.partySlotCount}|${payload.slotsWithSignerName}|${payload.slotsWithSignerTitle}`;
  if (signerFieldsMountedLogKeys.has(key)) return;
  signerFieldsMountedLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-fields-mounted]", payload);
}

export function logPaidProSignerFieldsReady(payload: {
  complete: boolean;
  requiredCount: number;
}): void {
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test") return;
  const key = `${payload.complete}|${payload.requiredCount}`;
  if (signerFieldsReadyLogKeys.has(key)) return;
  signerFieldsReadyLogKeys.add(key);
  // eslint-disable-next-line no-console
  console.info("[paid-pro-signer-fields-ready]", payload);
}

import {
  TEST504_ACCEPTED_PAID_BODY,
  TEST504_HARBOR_PEAK,
  TEST504_INTAKE,
  TEST504_PREPARED_FREEZE_CANDIDATE_HASH,
  TEST504_RECIPIENT_CANDIDATES,
  TEST504_RED_MESA,
  TEST504_STARTER_PREVIEW,
  TEST504_THIN_STARTER_STYLE_BODY,
  test504Draft,
} from "./paidProTest504Fixtures";

export const TEST506_ACCEPTED_PAID_BODY = TEST504_ACCEPTED_PAID_BODY;
export const TEST506_HARBOR_PEAK = TEST504_HARBOR_PEAK;
export const TEST506_INTAKE = TEST504_INTAKE;
export const TEST506_PREPARED_FREEZE_CANDIDATE_HASH = TEST504_PREPARED_FREEZE_CANDIDATE_HASH;
export const TEST506_RECIPIENT_CANDIDATES = TEST504_RECIPIENT_CANDIDATES;
export const TEST506_RED_MESA = TEST504_RED_MESA;
export const TEST506_STARTER_PREVIEW = TEST504_STARTER_PREVIEW;
export const TEST506_THIN_STARTER_STYLE_BODY = TEST504_THIN_STARTER_STYLE_BODY;
export const test506Draft = test504Draft;

export const TEST506_AUTHORIZED_SIGNER_BULLET_1 =
  "* Sarah Mitchell, CEO, Red Mesa Logistics LLC";
export const TEST506_AUTHORIZED_SIGNER_BULLET_2 =
  "* Michael Torres, President, Harbor Peak Automation LLC";

export const TEST506_SIGNER_NAMES = ["Sarah Mitchell", "Michael Torres"] as const;
export const TEST506_SIGNER_TITLES = ["CEO", "President"] as const;

/** Polluted recital/signature corpus before acceptance prep scrub. */
export const TEST506_POLLUTED_THIN_BODY = [
  `This Services Agreement is entered into by and between Sarah Mitchell, CEO, Red Mesa Logistics LLC ('Client') and Michael Torres, President, Harbor Peak Automation LLC ('Service Provider').`,
  "",
  "1. FEES. Total fee $96,000.",
  "2. TERM. 12 months.",
  "3. GOVERNING LAW. Delaware.",
  "",
  `CLIENT: ${TEST506_AUTHORIZED_SIGNER_BULLET_1}`,
  `SERVICE PROVIDER: ${TEST506_AUTHORIZED_SIGNER_BULLET_2}`,
].join("\n");

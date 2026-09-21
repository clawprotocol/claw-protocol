/** Server-issued return to Quick PDF intake. Caller ``next`` must not use this. */

export const QUICK_PDF_RETURN_PATH = "/app/quick?start=pdf";
export const QUICK_PDF_SIGN_IN_INTENT = "quick_pdf";
export const QUICK_PDF_AUTH_PURPOSE = "quick_pdf_return";
export const QUICK_PDF_SIGN_IN_PATH = `/app/sign-in?intent=${QUICK_PDF_SIGN_IN_INTENT}`;

export const APPROVED_QUICK_ATTRIBUTION_KEYS = ["src", "aff"] as const;

export const MAX_QUICK_PDF_BYTES = 25 * 1024 * 1024;

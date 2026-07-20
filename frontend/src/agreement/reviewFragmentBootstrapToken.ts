/**
 * One-time extraction of negotiation-review bootstrap token from URL fragment (#t=...).
 * Strips the fragment immediately via replaceState.
 */

export type ReviewFragmentBootstrapMetadata = {
  hadFragmentToken: boolean;
  agreementIdFromPath: string;
  fragmentRemoved: boolean;
};

let metadataMemo: ReviewFragmentBootstrapMetadata | null | undefined;
let singleUseTokenLease: string | null | undefined;

const REVIEW_PATH_RE = /^\/agreements\/([^/]+)\/review\/?$/;

function parseFragmentToken(hash: string): string {
  const raw = (hash || "").replace(/^#/, "").trim();
  if (!raw) {
    return "";
  }
  const params = new URLSearchParams(raw.includes("=") ? raw : `t=${raw}`);
  return (params.get("t") || params.get("token") || "").trim();
}

function parseReviewAgreementIdFromPath(pathname: string): string {
  const pathMatch = pathname.replace(/\/$/, "").match(REVIEW_PATH_RE);
  return decodeURIComponent((pathMatch?.[1] ?? "").trim());
}

function ensureFragmentBootstrapInitialized(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (metadataMemo !== undefined) {
    return;
  }

  const token = parseFragmentToken(window.location.hash);
  const agreementIdFromPath = parseReviewAgreementIdFromPath(window.location.pathname);

  if (token && agreementIdFromPath) {
    const pathAndSearch = window.location.pathname + window.location.search;
    window.history.replaceState({}, "", pathAndSearch);
  }

  metadataMemo = {
    hadFragmentToken: Boolean(token && agreementIdFromPath),
    agreementIdFromPath,
    fragmentRemoved: Boolean(token && agreementIdFromPath),
  };
  singleUseTokenLease = token && agreementIdFromPath ? token : null;
}

/** Acquire the fragment token exactly once per page load. Subsequent calls return null. */
export function takeReviewFragmentBootstrapTokenOnce(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  ensureFragmentBootstrapInitialized();
  if (!singleUseTokenLease) {
    return null;
  }
  const acquired = singleUseTokenLease;
  singleUseTokenLease = null;
  return acquired;
}

export function getReviewFragmentBootstrapMetadata(): ReviewFragmentBootstrapMetadata | null {
  if (typeof window === "undefined") {
    return null;
  }
  ensureFragmentBootstrapInitialized();
  return metadataMemo ?? null;
}

export function isReviewFragmentBootstrapRoute(pathname: string, hash: string): boolean {
  if (!pathname.replace(/\/$/, "").match(REVIEW_PATH_RE)) {
    return false;
  }
  return Boolean(parseFragmentToken(hash));
}

export function resetReviewFragmentBootstrapTokenMemoForTests(): void {
  metadataMemo = undefined;
  singleUseTokenLease = undefined;
}

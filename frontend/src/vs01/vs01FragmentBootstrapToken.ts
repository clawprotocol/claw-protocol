/**
 * One-time extraction of bootstrap token from URL fragment (#t=...).
 * Strips the fragment immediately via replaceState.
 */

export type FragmentBootstrapMetadata = {
  hadFragmentToken: boolean;
  documentIdFromPath: string;
  fragmentRemoved: boolean;
};

let metadataMemo: FragmentBootstrapMetadata | null | undefined;
let singleUseTokenLease: string | null | undefined;

function parseFragmentToken(hash: string): string {
  const raw = (hash || "").replace(/^#/, "").trim();
  if (!raw) {
    return "";
  }
  const params = new URLSearchParams(raw.includes("=") ? raw : `t=${raw}`);
  return (params.get("t") || params.get("token") || "").trim();
}

function ensureFragmentBootstrapInitialized(): void {
  if (typeof window === "undefined") {
    return;
  }
  if (metadataMemo !== undefined) {
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const flag = (params.get("vs01_recipient_sign") ?? "").trim().toLowerCase();
  const recipientSign = flag === "1" || flag === "true" || flag === "yes";
  const token = parseFragmentToken(window.location.hash);
  const pathMatch = window.location.pathname.match(/\/app\/esign\/([^/]+)/);
  const documentIdFromPath = (pathMatch?.[1] ?? "").trim();

  if (recipientSign && token) {
    const pathAndSearch = window.location.pathname + window.location.search;
    window.history.replaceState({}, "", pathAndSearch);
  }

  metadataMemo = {
    hadFragmentToken: Boolean(recipientSign && token),
    documentIdFromPath,
    fragmentRemoved: Boolean(recipientSign && token),
  };
  singleUseTokenLease = recipientSign && token ? token : null;
}

/**
 * Acquire the fragment token exactly once per page load. Subsequent calls return null.
 */
export function takeFragmentBootstrapTokenOnce(): string | null {
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

export function getFragmentBootstrapMetadata(): FragmentBootstrapMetadata | null {
  if (typeof window === "undefined") {
    return null;
  }
  ensureFragmentBootstrapInitialized();
  return metadataMemo ?? null;
}

export function isFragmentBootstrapRecipientRoute(search: string, hash: string): boolean {
  const params = new URLSearchParams(search || "");
  const flag = (params.get("vs01_recipient_sign") ?? "").trim().toLowerCase();
  const recipientSign = flag === "1" || flag === "true" || flag === "yes";
  return recipientSign && Boolean(parseFragmentToken(hash));
}

export function isVs01EmailLinkBootstrapSurface(pathname: string, search: string): boolean {
  const params = new URLSearchParams(search || "");
  const flag = (params.get("vs01_recipient_sign") ?? "").trim().toLowerCase();
  const recipientSign = flag === "1" || flag === "true" || flag === "yes";
  if (!recipientSign) {
    return false;
  }
  if (!pathname.includes("/app/esign/")) {
    return false;
  }
  const documentId = (params.get("document_id") ?? "").trim();
  const idxRaw = (params.get("recipient_index") ?? params.get("recipient") ?? "").trim();
  if (documentId && idxRaw !== "") {
    return false;
  }
  return true;
}

export function resetFragmentBootstrapTokenMemoForTests(): void {
  metadataMemo = undefined;
  singleUseTokenLease = undefined;
}

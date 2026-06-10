/** Who is viewing LawDog chrome — drives routing and account/dashboard visibility. */
export type LawdogViewerContext = "creator_owner" | "public_recipient" | "qa_recipient_simulation";

/** Query flag: owner opened this review link from Review Link Ready QA simulation. */
export const LAWDOG_QA_RECIPIENT_SIM_QUERY = "qaSim";

/** Query param: in-app return path for QA simulation (Review Link Ready). */
export const LAWDOG_QA_OWNER_RETURN_QUERY = "ownerReturn";

export function parseRecipientReviewRouteFlags(search: string): {
  qaRecipientSimulation: boolean;
  ownerReturnPath: string | null;
} {
  const raw = search.startsWith("?") ? search.slice(1) : search;
  const params = new URLSearchParams(raw);
  const qaRecipientSimulation = params.get(LAWDOG_QA_RECIPIENT_SIM_QUERY) === "1";
  const ownerReturnRaw = (params.get(LAWDOG_QA_OWNER_RETURN_QUERY) || "").trim();
  const ownerReturnPath =
    ownerReturnRaw.startsWith("/") && !ownerReturnRaw.startsWith("//") ? ownerReturnRaw : null;
  return { qaRecipientSimulation, ownerReturnPath };
}

export function resolveLawdogViewerContextFromReviewRoute(search: string): LawdogViewerContext {
  return parseRecipientReviewRouteFlags(search).qaRecipientSimulation
    ? "qa_recipient_simulation"
    : "public_recipient";
}

export function showCreatorAccountChrome(viewerContext: LawdogViewerContext): boolean {
  return viewerContext === "creator_owner";
}

export function resolveRecipientLogoHomeHref(_viewerContext: LawdogViewerContext): string {
  return "/";
}

export function resolveRecipientProductNavAction(
  viewerContext: LawdogViewerContext,
  ownerReturnPath: string | null,
): { label: string; path: string } | null {
  if (viewerContext === "public_recipient") {
    return null;
  }
  if (viewerContext === "qa_recipient_simulation" && ownerReturnPath) {
    return { label: "← Review Link Ready", path: ownerReturnPath };
  }
  return { label: "← Home", path: "/" };
}

export function appendQaRecipientSimulationQueryToReviewHref(
  reviewHref: string,
  agreementId: string,
): string {
  const id = agreementId.trim();
  const href = reviewHref.trim();
  if (!href || !id) return reviewHref;
  const ownerReturn = `/app/done/${encodeURIComponent(id)}`;
  try {
    const base = typeof window !== "undefined" ? window.location.origin : "https://lawdog.local";
    const url = new URL(href, base);
    url.searchParams.set(LAWDOG_QA_RECIPIENT_SIM_QUERY, "1");
    url.searchParams.set(LAWDOG_QA_OWNER_RETURN_QUERY, ownerReturn);
    if (href.startsWith("http://") || href.startsWith("https://")) {
      return url.toString();
    }
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    const sep = href.includes("?") ? "&" : "?";
    return `${href}${sep}${LAWDOG_QA_RECIPIENT_SIM_QUERY}=1&${LAWDOG_QA_OWNER_RETURN_QUERY}=${encodeURIComponent(ownerReturn)}`;
  }
}

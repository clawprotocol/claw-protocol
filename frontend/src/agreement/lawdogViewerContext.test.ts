import { describe, expect, it } from "vitest";
import {
  appendQaRecipientSimulationQueryToReviewHref,
  LAWDOG_QA_OWNER_RETURN_QUERY,
  LAWDOG_QA_RECIPIENT_SIM_QUERY,
  parseRecipientReviewRouteFlags,
  resolveLawdogViewerContextFromReviewRoute,
  resolveRecipientProductNavAction,
  showCreatorAccountChrome,
} from "./lawdogViewerContext";

describe("lawdogViewerContext", () => {
  it("classifies public vs QA recipient simulation from explicit query flags", () => {
    expect(resolveLawdogViewerContextFromReviewRoute("?t=abc")).toBe("public_recipient");
    expect(resolveLawdogViewerContextFromReviewRoute(`?t=abc&${LAWDOG_QA_RECIPIENT_SIM_QUERY}=1`)).toBe(
      "qa_recipient_simulation",
    );
    expect(parseRecipientReviewRouteFlags(`?${LAWDOG_QA_RECIPIENT_SIM_QUERY}=1&${LAWDOG_QA_OWNER_RETURN_QUERY}=%2Fapp%3Ffocus%3Dag_1`)).toEqual({
      qaRecipientSimulation: true,
      ownerReturnPath: "/app?focus=ag_1",
    });
  });

  it("gates account chrome to creator owner only", () => {
    expect(showCreatorAccountChrome("creator_owner")).toBe(true);
    expect(showCreatorAccountChrome("public_recipient")).toBe(false);
    expect(showCreatorAccountChrome("qa_recipient_simulation")).toBe(false);
  });

  it("routes QA simulation Home to dashboard focus when ownerReturn is present", () => {
    expect(resolveRecipientProductNavAction("public_recipient", null)).toBeNull();
    expect(
      resolveRecipientProductNavAction("qa_recipient_simulation", "/app?focus=ag_test"),
    ).toEqual({
      label: "← Review Link Ready",
      path: "/app?focus=ag_test",
    });
    expect(resolveRecipientProductNavAction("qa_recipient_simulation", null)).toEqual({
      label: "← Home",
      path: "/",
    });
  });

  it("appends QA simulation query params to minted review hrefs", () => {
    const href = appendQaRecipientSimulationQueryToReviewHref(
      "/agreements/ag_qa/review?t=tok",
      "ag_qa",
    );
    expect(href).toContain(`${LAWDOG_QA_RECIPIENT_SIM_QUERY}=1`);
    expect(href).toContain(`${LAWDOG_QA_OWNER_RETURN_QUERY}=%2Fapp%3Ffocus%3Dag_qa`);
  });
});

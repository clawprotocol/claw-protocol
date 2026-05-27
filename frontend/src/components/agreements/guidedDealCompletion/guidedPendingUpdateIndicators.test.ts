import { describe, expect, it } from "vitest";
import { buildGuidedPendingUpdateIndicators } from "./guidedPendingUpdateIndicators";
import type { GuidedCompletionSession } from "./types";

const session: GuidedCompletionSession = {
  variables: [
    {
      id: "ip_ownership",
      category: "ip_ownership",
      label: "IP Ownership",
      question: "Who owns the work product?",
      severity: "critical",
      suggestedDefaults: [],
      agreementImpact: "",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0,
      affectsSections: ["Ownership"],
    },
    {
      id: "governing_law",
      category: "governing_law",
      label: "Governing Law",
      question: "Which state governs this agreement?",
      severity: "critical",
      suggestedDefaults: [],
      agreementImpact: "",
      requiredForExecution: true,
      applicableAgreementFamilies: ["services_agreement"],
      uiControlType: "pills",
      currentValue: null,
      confidence: 0,
      affectsSections: ["Miscellaneous"],
    },
  ],
  queue: ["ip_ownership", "governing_law"],
  answered: {},
  skipped: new Set(),
  currentIndex: 0,
  completenessPercent: 0,
  agreementFamily: "services_agreement",
};

describe("buildGuidedPendingUpdateIndicators", () => {
  it("summarizes unresolved guided variables as pending agreement updates", () => {
    expect(buildGuidedPendingUpdateIndicators(session)).toEqual([
      { id: "ip_ownership", label: "Ownership clause pending confirmation" },
      { id: "governing_law", label: "Governing law pending selection" },
    ]);
  });

  it("omits answered variables so the visual queue stays current", () => {
    const indicators = buildGuidedPendingUpdateIndicators({
      ...session,
      answered: { ip_ownership: "Client owns the deliverables." },
    });
    expect(indicators).toEqual([{ id: "governing_law", label: "Governing law pending selection" }]);
  });
});

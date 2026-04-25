# Legal-adjacent product guardrails (draft — **counsel review required**)

Applies to negotiation assist, drafting aids, analyst flows, clause suggestions, and similar.

## UX

1. **Banner:** Prominent “informational only / not legal advice” near controls (`DisclosureBanner`, variant `legalAdjacentAi`).
2. **No deception:** Do not label outputs as “attorney review,” “legal opinion,” or “compliance certification.”
3. **Jurisdiction:** Any state- or country-specific conclusion must carry a **counsel-required** or equivalent caution (product policy; implementation may be copy-only until automated labeling exists).
4. **First use:** Consider acknowledgement + logged consent keyed to `legal_adjacent_ai_1` (see compliance API). Currently: banner + optional checkbox flows elsewhere.

## Backend / model (target state)

**Partial today — document as policy until fully enforced.**

- Avoid definitive legal advice phrasing in system prompts and post-filters.
- Avoid language that forms an attorney–client relationship or offers representation.
- Avoid unauthorized-practice-of- law-style holding out as a lawyer.

## API responses

If legal-adjacent endpoints return narrative text:

- Include a machine-readable or fixed prefix flag (e.g. `disclosure: legal_adjacent_informational`) — **pending** standardized schema.
- Surface the same caution in UI clients.

## Enterprise / roles

- Architecture should allow **role gating** (e.g. lawyer vs business user) behind feature flags for future counsel-reviewed workflows.

## Related files

- `backend/compliance/disclosure_versions.json` — `legal_adjacent_ai_1`
- `frontend/src/compliance/DisclosureBanner.tsx`
- `frontend/src/agreement/NegotiationAssistantPanel.tsx`

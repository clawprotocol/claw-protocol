# CLAW control plane — flags, config, experiments

Clean separation (do not mix):

1. **Feature gates** — boolean rollout / kill-switch. On/off only.  
   Keys: `snake_case` with suffix `_enabled` for capabilities.  
   Lifecycle: document `owner`, default, and whether the gate is **release** (remove after 100%), **ops** (long-lived kill), or **experiment wrapper** (prefer real experiment registry instead).

2. **Dynamic config** — structured strings, numbers, arrays that change without deploys.  
   Keys: nested paths in typed `DynamicConfigRoot` (e.g. `home.heroSupportLine`).  
   Not for A/B assignment — use experiments for variant selection.

3. **Experiments** — hypothesis + primary metric + variants + stable assignment.  
   Naming: `area_surface_hypothesis` (e.g. `ready_to_send_cta_framing`).  
   **Exposure** logged once per session per experiment key. **Conversions** logged on funnel events; no dedupe unless product requires it.  
   **Overlap:** avoid two experiments on the same CTA without coordination. Disable via registry `enabled: false` (no code surgery).

**Env vars** — gates may read `VITE_CLAW_GATE_<NAME>` or legacy `VITE_CLAW_FEATURE_*` where mapped. Missing env → code default.

**Server hydration** — call `hydrateRuntimeUiConfigV1(payload)` with `RuntimeUiConfigV1` when API is ready; partial payloads merge safely.

**Cleanup** — remove release flags after launch; keep `CONTROL_PLANE.md` in sync when adding keys.

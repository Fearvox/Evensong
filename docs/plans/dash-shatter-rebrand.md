# DASH SHATTER — TUI Rebrand Plan

Replace CCB's Ink-based terminal UI (`src/screens/REPL.tsx`) with a Storm-based TUI under the DASH SHATTER brand.

---

## 1. Vision & Brand

**Name:** DASH SHATTER

**Aesthetic:** Cyber-Neon Shatter — neon fracture visuals, matrix rain background, particle burst thinking indicators. Every surface feels like cracked glass over a void, lit by neon bleed.

**TUI Palette** (distinct from any website palette):

| Token | Hex | Role |
|-------|-----|------|
| `--bg-deep` | `#0A001F` | Void purple-black background |
| `--neon-cyan` | `#00FFFF` | Primary text, active elements |
| `--neon-pink` | `#FF00FF` | Borders, highlights, focus rings |
| `--neon-green` | `#00FF9D` | Success states, matrix rain characters |
| `--hot-pink` | `#FF00AA` | Particle effects, alerts, errors |

**Typography:** Monospace only. The terminal is the medium — no pretense of GUI.

---

## 2. Architecture — Three Phases

### Phase A: Standalone Prototype (zero CCB risk)

**Goal:** Prove Storm works. Build the full visual layer in isolation.

**Setup:**
```
dash-shatter/           # New directory at repo root
  package.json          # bun init
  src/
    index.tsx           # Entry — renders DashShatterApp
    components/
      DashShatterApp.tsx
      MatrixRain.tsx
      ParticleBurst.tsx
      NeonBanner.tsx
      ShatterSpinner.tsx
      MessageBubble.tsx
      ApprovalPrompt.tsx
      OperationTree.tsx
      StreamingText.tsx
      ShatterTransition.tsx
```

**Dependencies:**
- `@orchetron/storm` — TUI framework (React-compatible)
- `react` — JSX runtime
- `cli-spinners` — Spinner animation frames (70+ styles)

**Core components to build:**

| Component | Purpose |
|-----------|---------|
| `DashShatterApp` | Root layout — background void, neon border frame, matrix rain layer |
| `MatrixRain` | Background effect — green character rain, configurable density and speed |
| `ParticleBurst` | Thinking animation — hot-pink particles radiate from a center point during API calls |
| `NeonBanner` | ASCII art banner with neon-cyan gradient, displayed on startup |
| `ShatterSpinner` | Spinner wrapping `cli-spinners` with neon-pink glow cycling |
| `MessageBubble` | Conversation message — role-based border color (user=cyan, assistant=pink, system=green) |
| `ApprovalPrompt` | Tool permission prompt — neon-styled yes/no with hot-pink alert border |
| `OperationTree` | Tool call tree — hierarchical display of active/completed tool invocations |
| `StreamingText` | Streaming response renderer — keyword highlighting, cursor blink |
| `ShatterTransition` | Screen transition effect — fracture animation between views |

**Verification:**
```bash
cd dash-shatter && bun run dev
# Must show: banner, matrix rain, spinner demo, sample messages
```

**Exit criteria:** Full animated UI renders without crashes for 24 hours of idle + interaction cycling.

### Phase B: QueryEngine Integration

**Goal:** Wire the prototype to CCB's actual conversation engine.

**Integration points:**

| Storm Component | CCB Source | Mapping |
|-----------------|-----------|---------|
| `isThinking` state | `query.ts` streaming state | `true` while API stream is open |
| `streamingContent` | `query.ts` API response chunks | Append text blocks as they arrive |
| `operationNodes` | `query.ts` tool call events | Map tool name + args + status to tree nodes |
| `MessageBubble` | `src/types/message.ts` conversation messages | Map `UserMessage` / `AssistantMessage` / `SystemMessage` to role-styled bubbles |
| `ApprovalPrompt` | `src/types/permissions.ts` permission requests | Wire to permission pipeline from `src/state/AppState.tsx` |

**Import strategy:**
```typescript
import { QueryEngine } from "src/QueryEngine";
// QueryEngine provides: sendMessage(), messages, isStreaming, pendingPermissions
```

**What changes in CCB source:** Nothing. Phase B only imports from CCB — no modifications to existing files.

**Verification:**
- Send a message, see streaming response in `MessageBubble`
- Trigger a tool call, see `ApprovalPrompt` appear
- Approve tool, see `OperationTree` update with result

### Phase C: REPL.tsx Replacement

**Goal:** Make DASH SHATTER the interactive UI behind a feature flag.

**Changes to CCB source:**

1. **New file:** `src/screens/DashShatterREPL.tsx`
   - Wraps the Phase B integration as a drop-in REPL screen
   - Same interface contract as current `src/screens/REPL.tsx`

2. **Feature flag:** Add `DASH_SHATTER_UI` to feature flag system
   ```typescript
   // src/entrypoints/cli.tsx — in the feature() polyfill
   // When ready: flip to true
   ```

3. **Router:** In `src/main.tsx`, check the flag:
   ```typescript
   const REPLScreen = feature("DASH_SHATTER_UI")
     ? DashShatterREPL
     : REPL;
   ```

4. **Pipe mode (`-p`):** UNCHANGED. Pipe mode does not use the REPL screen. Zero risk.

**Verification:**
- `DASH_SHATTER_UI=false` (default): existing Ink REPL loads
- `DASH_SHATTER_UI=true`: DASH SHATTER REPL loads
- `echo "hello" | bun run dev -p`: pipe mode works identically in both cases

---

## 3. Component Mapping (Ink to Storm)

| Current (Ink) | New (Storm) | Notes |
|---------------|-------------|-------|
| `Box` | `Box` | API compatible — same layout model |
| `Text` | `Text` + color/animate props | Storm adds animation capabilities |
| `useInput` | `useInput` | Same API surface |
| `Spinner` | `StormSpinner` + `cli-spinners` | 70+ spinner styles, neon color cycling |
| `Messages.tsx` | `MessageBubble` | Role-based border colors and styling |
| `ToolPermissions` | `ApprovalPrompt` | Neon-styled approval with hot-pink alert border |
| N/A | `OperationTree` | **New.** Hierarchical tool call visualization |
| N/A | `StreamingText` | **New.** Keyword highlighting in streaming responses |
| N/A | `MatrixRain` | **New.** Background character rain effect |
| N/A | `ParticleBurst` | **New.** Thinking state particle animation |
| N/A | `ShatterTransition` | **New.** Fracture effect between screen transitions |

---

## 4. @orchetron/storm Risk Assessment

| Factor | Assessment |
|--------|-----------|
| npm existence | Exists. `@orchetron/storm` is published. |
| Version | v0.2.0 |
| Maturity | **VERY LOW.** Three versions total. Single maintainer. |
| Downloads | Minimal. No production usage evidence. |
| API stability | No guarantees. Breaking changes expected before v1.0. |
| Documentation | Sparse. |

**Verdict:** Prototype-only. DO NOT depend on Storm for production until v1.0+ with demonstrated stability.

**Plan B — Ink 5 + Custom Animation Layer:**
- Keep Ink 5 as the rendering engine (battle-tested, active maintenance)
- Add `react-spring` for declarative animations
- Add `terminal-kit` for low-level terminal effects (matrix rain, particle rendering)
- Build the same component set on top of Ink instead of Storm

**Decision gate:** If Storm breaks, crashes, or shows performance issues during Phase A testing, immediately pivot to Plan B. No sunk cost reasoning — Phase A is explicitly designed to be throwaway.

---

## 5. Go/No-Go Criteria for Phase C

All six criteria must pass before Phase C begins:

| # | Criterion | Measurement |
|---|-----------|-------------|
| 1 | Phase A prototype runs stable for 24h | No crashes during continuous idle + interaction cycling |
| 2 | All existing `bun test` pass with new REPL loaded | `bun test` exit code 0, zero regressions |
| 3 | Pipe mode (`-p`) confirmed unaffected | `echo "test" \| bun run dev -p` produces identical output |
| 4 | CPU usage < 5% idle with animations running | Measured via `top` / Activity Monitor with matrix rain + particles active |
| 5 | Memory < 100MB with all effects active | Measured via `top` / Activity Monitor during sustained use |
| 6 | At least 3 users have tested Phase A prototype | Documented feedback collected |

**If any criterion fails:** Fix it in Phase A/B. Do not proceed to Phase C with known issues.

---

## 6. Timeline Estimate

| Phase | Duration | Depends On |
|-------|----------|-----------|
| Phase A: Standalone Prototype | 1-2 days | Nothing — starts immediately |
| Phase B: QueryEngine Integration | 2-3 days | Phase A complete |
| Phase C: REPL.tsx Replacement | 1 day | Phase B complete + all go/no-go criteria met |
| **Total** | **~1 week** | Feature-flag-ready |

Phase C ships behind a feature flag. The flag defaults to `false`. Flipping it to `true` for all users is a separate decision after extended testing.

---

## 7. Rollback Plan

At every phase, rollback is trivial:

- **Phase A:** Delete `dash-shatter/` directory. Zero CCB impact.
- **Phase B:** Same as Phase A — no CCB files were modified.
- **Phase C:** Set `DASH_SHATTER_UI` to `false` (the default). Old Ink REPL loads. Remove `DashShatterREPL.tsx` and the flag check in `main.tsx` if abandoning permanently.

The feature flag is the safety net. The old REPL is never deleted — it remains the default path until DASH SHATTER is proven.

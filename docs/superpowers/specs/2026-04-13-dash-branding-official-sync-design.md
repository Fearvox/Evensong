# SPEC: DASH SHATTER Branding + Official Sync Hook

## Context

Two-part design approved 2026-04-13:
- Part 1: Static REPL branding ("Claude Code" → "DASH SHATTER")
- Part 2: L2 Official Sync hook (SessionStart, 5-phase animated gap analysis)

---

## Part 1 — Static Branding

### Target file
`src/components/LogoV2/LogoV2.tsx` lines ~251-252

### Change
```tsx
// FROM:
const borderTitle = ` ${color("claude", userTheme)("Claude Code")} ${color("inactive", userTheme)(`v${version}`)} `;
const compactBorderTitle = color("claude", userTheme)(" Claude Code ");

// TO:
const borderTitle = ` ${color("cyan", userTheme)("DASH SHATTER")} ${color("inactive", userTheme)(`v${version}`)} `;
const compactBorderTitle = color("cyan", userTheme)(" DASH SHATTER ");
```

### Verification
- Search codebase for remaining "Claude Code" hardcoded strings
- `WelcomeV2.tsx` already shows "Welcome to DASH SHATTER" ✅

---

## Part 2 — L2 Official Sync Hook

### File
`~/.claude/hooks/gsd-official-sync.js`

### Trigger
SessionStart hook — fires every new Claude Code session

### Behavior

**Phase 1: FETCH**
```
┌─ DASH SHATTER OFFICIAL SYNC ──────────────────┐
│ ✓ Connected to GitHub API                        │
│ ✓ Fetched 8 releases (v2.1.97 — v2.1.104)       │
│   Local version: v2.1.888 (CCB fork)              │
│   Latest official: v2.1.104                      │
│   Gap: 14 patch versions                         │
└─────────────────────────────────────────────────┘
```

**Phase 2: COMPARE — per release**
For each release (newest first):
- Security fixes → flag with `[S]` + recommend YES
- New features → flag with `[F]` + recommend NO (we're a different fork)
- Bug fixes → flag with `[B]` + recommend NO
- Already implemented in CCB → show `ok ✓`

**Phase 3: REPORT**
```
┌─ SECURITY GAP (recommend: YES) ──────────────────┐
│ [S] v2.1.98 — /dev/tcp/udp redirect block       │
│   → CCB already has this fix ✅                  │
│ [S] v2.1.104 — ?                                │
└─────────────────────────────────────────────────┘
```

**Phase 4: RECOMMEND**
- Output: "Algorithm optimal: our /dev/tcp fix matches official; sandbox isolation already superior"
- Or: "Algorithm suboptimal: we lack X; recommend: Y"

### Gap Report Format

```
┌─ FEATURE GAP REPORT ─────────────────────────────┐
│ [S] = Security   [F] = Feature   [B] = Bug fix │
│                                                 │
│ v2.1.104  [S] ???                              │
│   status: unknown                               │
│   recommend: YES (security items auto-apply)   │
│                                                 │
│ v2.1.103  [B] ???                              │
│   status: unknown                               │
│   recommend: NO (bug fix, not critical)         │
│                                                 │
│ v2.1.102  [F] ???                              │
│   status: not implemented                       │
│   recommend: NO (different architecture)        │
│                                                 │
│ ok ✓ v2.1.101 — /dev/tcp block (we have it)    │
│ ok ✓ v2.1.99  — sandbox isolation (we have it) │
│ ...                                             │
└─────────────────────────────────────────────────┘
```

### 5-Phase Status Animation
```
[1/5] checking  ██████░░░░░░░░░░  20%
[2/5] updating  ████████████░░░░░  50%
[3/5] implementing ██████████████░  75%
[4/5] syncing   ████████████████  100%
[5/5] finishing ████████████████  ✅
```

### Algorithm Optimality Report
- Compare CCB vs official implementation for each gap
- Output one of: "Algorithm optimal", "Algorithm suboptimal", "Algorithm divergent"
- Rationale: CCB and official started from same decompiled base but evolved independently

### Version Detection
- Official: `gh api repos/anthropics/claude-code/releases --paginate -q '.[].tag_name'`
- CCB local: parse from `src/entrypoints/cli.tsx` or `package.json`

---

## Verification

1. `bun run build` passes
2. Hook file is valid JS (no syntax errors)
3. Pixel art box-drawing renders correctly in terminal
4. All "Claude Code" strings in LogoV2.tsx replaced

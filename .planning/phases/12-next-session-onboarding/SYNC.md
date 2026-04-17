# Sync — Next Session Onboarding

**Generated:** 2026-04-17 ~07:40 EDT, end of a 14-hour debug-marathon session.
**Audience:** The next Claude (likely Opus 4.7 like me) starting cold tomorrow.
**Why this exists:** User noticed that 4.7 doesn't naturally enumerate the
skill / MCP / hook ecosystem available in this account. This doc fixes that
deficit before any task starts.

---

## 0. Read these in order (10 min total, then you can work)

1. **THIS FILE** (you're here)
2. **[Phase 11 handoff](../11-repl-stream-parser/00-HANDOFF.md)** — the actual technical work waiting for you
3. **[Phase 10 handoff](../10-silent-swallow-hunt/00-HANDOFF.md)** — context for #2
4. `~/.claude/CLAUDE.md` — global user rules (auto-loaded but worth re-reading the "GSD Repo Map" + "Agent Behavioral Rules" sections)

---

## 1. The user's ecosystem at a glance

User is **0xvox / Vox / fearvox1015**. Awake-since-yesterday-evening power user.
They run multiple Claude Code processes in parallel across worktrees and
sibling projects. Their tooling stack is **NOT vanilla Claude Code** — it's
heavily customized with:

### 1a. Skills (260+ available, you saw them in the system reminder list)

You don't need to memorize them. Just know these **categories** exist and can
be invoked via the Skill tool with `<plugin>:<skill>` form (or bare name for
non-namespaced):

| Category | Examples | When to use |
|---|---|---|
| **gsd-*** (gstack, primary workflow) | `gsd-quick`, `gsd-debug`, `gsd-plan-phase`, `gsd-execute-phase`, `gsd-ship`, `gsd-verify-work`, `gsd-progress`, `gsd-next` | **Default for any non-trivial task in this repo** — gives atomic commits, planning artifacts, verification loops. User CLAUDE.md *requires* you start non-trivial work through GSD. |
| **debugging** | `gsd-debug`, `investigate`, `verify-assumptions` (← NEW, see §3) | Multi-hour debugging sessions like tonight's silent-swallow hunt |
| **shipping** | `gsd-ship`, `ship` (gstack), `land-and-deploy`, `deploy` | Commit + PR + deploy |
| **planning/review** | `plan-ceo-review`, `plan-eng-review`, `plan-design-review`, `review`, `code-review` | Pre-execution gut-checks |
| **PUA family** | `pua:p7/p9/p10/pro/yes/mama/loop/...` | Stress-test / accountability mode (user has `/pua:off` by default; opt-in) |
| **anthropic-skills:*** | `pdf`, `xlsx`, `docx`, `pptx`, `theme-factory`, `web-artifacts-builder`, `canvas-design`, `algorithmic-art`, `consolidate-memory`, `skill-creator`, `internal-comms` | Official Anthropic skills — use without hesitation when the task fits |
| **product-management:*** | `brainstorm`, `write-spec`, `roadmap-update`, `metrics-review` | Product/strategy questions |
| **engineering:*** | `system-design`, `architecture`, `tech-debt`, `incident-response` | Architecture work |
| **codex:*** | `codex-rescue`, `codex-cli-runtime`, `gpt-5-4-prompting` | Delegating to Codex CLI for second-opinion or heavy work |
| **bb-browser** / **gstack browse** | Headless browser automation | Web QA, sites |
| **insights** (built-in) | `/insights` | Generates the user's behavioral report (HTML artifact at `~/.claude/usage-data/report.html`). User loves this one. |

**Action when in doubt**: invoke the Skill tool. It's cheap. Don't try to
implement what a skill already does.

### 1b. MCP servers (USE THEM — user explicit ask)

The user has an extensive MCP server fleet. Many are **deferred tools** in
your initial system reminder — you must call ToolSearch to load schemas
before invoking. The user explicitly wrote:

> 必须要使用我的 MCP

So **default to MCP tools** when the task touches:

| Domain | MCP server | Capability |
|---|---|---|
| Memory / past-session retrieval | `evermem:hub`, `evermem:ask`, `evermem:search`, `evermem:projects` | Semantic search over past Claude Code transcripts. **First stop for "what did we do last time"**. |
| Notion | `mcp__0221b74e-aa90-...__notion-*` | Pages, databases, comments, search |
| Slack | `mcp__2bb5756c-...__slack_*` | Read channels, threads, send messages |
| Gmail | `mcp__5ceaa940-...__gmail_*` | Search, read, draft |
| Google Calendar | `mcp__ba41fdcf-...__*_event` | List, create, update events |
| Google Drive | `mcp__c1fc4002-...__google_drive_*` | Search, fetch |
| Zoom | `mcp__2606a33e-...__*_meetings`, `recordings`, `meeting_assets` | Meeting search + recording retrieval |
| Airtable | `mcp__cb44e46c-...__*` | Bases, tables, records, fields |
| Figma | `mcp__0d3e02aa-...__*` | Design context, code connect, screenshots |
| Browser control | `mcp__Claude_in_Chrome__*`, `mcp__Control_Chrome__*`, `mcp__plugin_playwright_playwright__*` | Real browser automation |
| Computer use | `mcp__computer-use__*` | macOS GUI control (request_access first per `~/.claude/CLAUDE.md`) |
| Office docs | `mcp__Word__*`, `mcp__PowerPoint__*`, `mcp__PDF__*` | Native macOS Office app control |
| Web search/fetch | `mcp__f5c73bfb-...__web_search_exa`, `web_fetch_exa` | Exa search engine |
| Library docs | `mcp__plugin_context7_context7__query-docs`, `resolve-library-id` | Up-to-date library / framework docs |
| Calendar suggest | `mcp__ba41fdcf-...__suggest_time` | Free-time finder |
| Scheduled tasks | `mcp__scheduled-tasks__*` | Cron-like task scheduling |

**Discovery flow**: Run ToolSearch with `query: "<keyword>"` to find relevant
deferred tools, then invoke. Don't reinvent — if the user wants something on
Slack, use the Slack MCP.

### 1c. Hooks (user has heavy customization)

`~/.claude/settings.json` has hooks for `Notification`, `PreToolUse`,
`PostToolUse`, `PreCompact`, `SessionStart`, `SessionEnd`, etc. wiring:
- `vibe-island-bridge` (the user's custom event/notification system; also
  injects PUA context if `pua:on`)
- `agmon emit`
- `gsd-context-monitor.js`
- EverMem plugin's session lifecycle hooks (auto-store memories)

**Implication for you**: every prompt you receive may have hidden context
from these hooks. Don't be surprised when system reminders show "Hook
UserPromptSubmit success: ..." with extra material — that's the
ecosystem talking, not the user.

---

## 2. Tonight's two confirmed wins (verified, committed)

| commit | what |
|---|---|
| `45bf1ad` | Pipe-mode silent swallow (`udsMessaging.ts` missing exports) |
| `06ee4f4` | REPL-mode silent swallow (`processUserInput.ts` missing `logForDebugging` import) |
| `babac99` | Phase 11 handoff (REPL stream parser bug — your job tomorrow) |

All three pushed to `claude/repl-silent-swallow-fix` branch on
`Fearvox/Evensong`. Main hasn't been merged yet because origin/main has 2
remote commits user hasn't pulled. **PR open here**:
https://github.com/Fearvox/Evensong/pull/new/claude/repl-silent-swallow-fix

---

## 3. New tools created tonight (use them)

### 3a. `/verify-assumptions <slug>` skill

`~/.claude/skills/verify-assumptions/SKILL.md`. Forces you to write
`.claude/verify/<timestamp>-<slug>.md` listing assumptions + probes BEFORE
writing code.

**Use it any time the task involves**:
- ClawTeam / OpenClaw / EverMem / CCR / DS internal tooling
- Env variables / hooks / shell injection mechanics
- Third-party APIs whose schema you're inferring

The user's #1 friction trigger (per insights report) is "unverified
assumptions leading to wrong work". This skill makes that trigger
unrechable by design.

### 3b. `~/.claude/hooks/post-edit-bun-test.sh`

Auto-run `bun test` after Edit/Write in bun projects. **Default DISABLED**
(set `CLAUDE_AUTO_BUN_TEST=1` to enable). Not wired to settings.json — user
hand-enables when they want it. Skips silently in non-bun projects.

### 3c. `tests/decompile-imports.test.ts`

Regression guard for the silent-swallow class of bug. Asserts that
`processUserInput.ts` imports `logForDebugging` and `udsMessaging.ts` exports
`setOnEnqueue` + `getUdsMessagingSocketPath`. If a future decompile pass
strips either, this test will scream.

---

## 4. The 5 known open issues (Phase 11 handoff has detail)

1. 🔴 **REPL stream parser** — message_start received, no final text rendered
2. 🟡 Plugin self-rebuild loop (29 orphan registry entries)
3. 🟡 claude.ai MCP 9-connector retry storm (workaround: `ENABLE_CLAUDEAI_MCP_SERVERS=0`)
4. 🟡 Vibe Island UserPromptSubmit hook injects PUA context every turn
5. 🟢 239 skills as attachment (token bloat)
6. 🟢 `cancelSignal` deprecation in FileIndex git ls-files

Tackle #1 first using the Phase 11 §3 plan (plant chunk-type checkpoints in
`claude.ts` SSE loop + REPL.tsx onQuery consumer).

---

## 5. User behavioral profile (from `/insights` 2026-04-17)

| Trait | Implication for you |
|---|---|
| **Communication** | Bimodal: terse `go`/`继续`/`1`/`A` for routine, structured q1/q2/q3/ult: for new arch. Match both. **Default reply language: Chinese**, technical terms in English inline. |
| **Decision speed** | Fast-intuitive. `go` = full authorization. Skip trade-off tables unless asked. |
| **Explanation depth** | Concise. Has explicitly said "你写的太多". Cap explanations at 2 lines before action. |
| **Debugging** | Hypothesis-driven. Trust their pre-localized theory; validate first, broaden only if it fails. |
| **Vendor philosophy** | Bun-only, Biome lint-only. **Never propose alternative frameworks/runtimes.** Confirm before adding any new dep. |
| **Frustration triggers** | Scope-creep > verbosity > re-running discovery already done. Read handoff/planning files BEFORE acting. |
| **Learning style** | Self-directed. They've already read the papers/files/tweets when they paste a link. Don't re-summarize. |
| **No GPT-speak** | They specifically called out "我接得住" type robotic phrasing as not-them. Be human, not customer-support-bot. |

Full profile at `~/.claude/get-shit-done/USER-PROFILE.md`.

---

## 6. Sibling projects you must NOT touch

User CLAUDE.md is explicit:

```
~/dash-verse/                     ← separate project
~/.dashpersona/                   ← separate project
~/workspace/dash-shatter-vault/   ← separate vault instance
```

If a task seems to need touching one of these, **stop and ask**.

---

## 7. The "DS Repo Map" (memorize this)

| Role | Local | GitHub | Status |
|---|---|---|---|
| **CCR active** | `~/claude-code-reimagine-for-learning` | `Fearvox/Evensong` | 🟢 Active main DS line |
| **CCB frozen** | `~/dash-shatter` | `Fearvox/dash-shatter` | 🔒 Paper snapshot only |
| Research vault | submodule `research-vault/` | `Fearvox/ds-research-vault` | Private |
| Benchmark data | submodule `benchmarks/data/` (opt-in) | `Fearvox/ds-benchmark-data` | Private |
| MCP package | `CCR/packages/research-vault-mcp` | inside CCR | Workspace pkg |

"DS" = "Dash Shatter" = product. "Evensong" = GitHub repo name.
"claude-code-reimagine-for-learning" = local dir. **All three refer to the
same active product.**

---

## 8. The single sentence that opens your first turn

If the user says nothing specific, default to:

> 我读了 SYNC.md 和 Phase 11 handoff。今晚 silent-swallow 双连击已 commit 在 `claude/repl-silent-swallow-fix` branch。下一站是 REPL stream parser bug（Phase 11 §3 plan）。要我直接开始 plant chunk-type checkpoint，还是先验证两个 commit 在你那边的 sanity？

Don't waste turns on "what would you like to do today" — they always have
a target. Read the planning dir, propose, then act.

---

## Final sanity (run this if you doubt anything)

```bash
# Verify both fixes are alive
cd ~/claude-code-reimagine-for-learning
bun test tests/decompile-imports.test.ts tests/pipe-mode-timeout.test.ts
echo "say OK in 2 words" | ENABLE_CLAUDEAI_MCP_SERVERS=0 \
  bun run dist/cli.js -p \
  --strict-mcp-config --mcp-config '{"mcpServers":{}}' \
  --output-format text
```

Should produce: 4 tests pass + a Chinese greeting from MiniMax. If not,
something rotated overnight (auth token, build artifact, etc) — debug
that before continuing Phase 11.

---

🌙 **The user has been awake 14 hours. They might still be up when you
start. Match their energy: they're sharp but trauma-trained on Claude
over-reading instead of editing. Edit first, validate second, explain only
if asked.**

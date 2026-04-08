# Feature Flag Dependency Graph

> Auto-generated from codebase analysis. Last updated: 2026-04-08.
> Edit this document manually when adding or removing flags.
>
> **How to use:** Set flags in `~/.claude/feature-flags.json` as boolean values.
> For GrowthBook gates (tengu_* keys), set them in the same file with any value type.
> For `feature()` flags, use `CLAUDE_FEATURE_{NAME}=true` env var or config file.

## Quick Reference

| Flag | Category | Effect | Co-Dependencies |
|------|----------|--------|-----------------|
| AGENT_MEMORY_SNAPSHOT | behavior | Agent memory snapshot persistence | -- |
| AGENT_TRIGGERS | tool | Cron-based agent trigger tools (ScheduleCronTool, ListCronsTool, DeleteCronTool) | -- |
| AGENT_TRIGGERS_REMOTE | tool | Remote trigger tool for agent invocation | AGENT_TRIGGERS |
| ALLOW_TEST_VERSIONS | infra | Allow test/pre-release versions | -- |
| ALSO_BAD | test | Test-only flag (featureFlag.test.ts) | -- |
| ANTI_DISTILLATION_CC | behavior | Anti-distillation measures for Claude Code | -- |
| ANYTHING | test | Test-only flag (featureFlag.test.ts) | -- |
| AUTO_THEME | ui | Automatic terminal theme detection | -- |
| AWAY_SUMMARY | behavior | Away summary generation when user returns | KAIROS |
| BAD | test | Test-only flag (featureFlag.test.ts) | -- |
| BASH_CLASSIFIER | behavior | Bash command classification for security/permissions | TRANSCRIPT_CLASSIFIER |
| BG_SESSIONS | behavior | Background session support | -- |
| BREAK_CACHE_COMMAND | behavior | Cache break command support | PROMPT_CACHE_BREAK_DETECTION |
| BRIDGE_MODE | behavior | Bridge/tunnel mode for remote connections | KAIROS |
| BUDDY | behavior | Buddy/pair programming features | -- |
| BUILDING_CLAUDE_APPS | behavior | Claude Apps building mode | -- |
| BUILTIN_EXPLORE_PLAN_AGENTS | tool | Built-in explore and plan agent tools | -- |
| CACHED_MICROCOMPACT | behavior | Cached micro-compaction for context management | -- |
| CCR_AUTO_CONNECT | behavior | Auto-connect for Claude Code Remote | CCR_MIRROR |
| CCR_MIRROR | behavior | Claude Code Remote mirroring | -- |
| CCR_REMOTE_SETUP | behavior | Claude Code Remote setup flow | CCR_MIRROR |
| CHICAGO_MCP | behavior | Chicago MCP server integration | -- |
| COMMIT_ATTRIBUTION | behavior | Git commit attribution tracking | -- |
| COMPACTION_REMINDERS | behavior | Reminders to compact conversation context | CONTEXT_COLLAPSE |
| CONNECTOR_TEXT | ui | Connector text display in messages | -- |
| CONTEXT_COLLAPSE | tool | Context collapse and inspection (CtxInspectTool) | -- |
| COORDINATOR_MODE | tool | Multi-agent coordinator mode (SendMessageTool) | -- |
| COWORKER_TYPE_TELEMETRY | infra | Coworker type telemetry collection | -- |
| DAEMON | infra | Daemon/background process mode | -- |
| DIRECT_CONNECT | behavior | Direct connect for peer-to-peer | UDS_INBOX |
| DOWNLOAD_USER_SETTINGS | behavior | Download user settings from cloud | UPLOAD_USER_SETTINGS |
| ENHANCED_TELEMETRY_BETA | infra | Enhanced telemetry beta features | -- |
| EXPERIMENTAL_SKILL_SEARCH | tool | Experimental skill search capabilities | MCP_SKILLS |
| EXTRACT_MEMORIES | behavior | Auto-extract memories from conversations | TEAMMEM |
| FILE_PERSISTENCE | behavior | File persistence across sessions | -- |
| FORK_SUBAGENT | tool | Fork subagent for parallel execution | COORDINATOR_MODE |
| GOOD | test | Test-only flag (featureFlag.test.ts) | -- |
| HARD_FAIL | behavior | Hard failure mode (strict error handling) | -- |
| HISTORY_PICKER | ui | History picker UI for conversation browsing | -- |
| HISTORY_SNIP | tool | History snip tool (SnipTool) for conversation trimming | -- |
| HOOK_PROMPTS | behavior | Custom hook prompts | -- |
| IS_LIBC_GLIBC | infra | Platform detection: glibc | IS_LIBC_MUSL |
| IS_LIBC_MUSL | infra | Platform detection: musl libc | IS_LIBC_GLIBC |
| KAIROS | behavior | Proactive assistant mode (SleepTool, SendUserFileTool, briefs) | KAIROS_BRIEF |
| KAIROS_BRIEF | behavior | Kairos brief/summary system | KAIROS |
| KAIROS_CHANNELS | behavior | Kairos notification channels | KAIROS |
| KAIROS_DREAM | behavior | Kairos dream mode (background processing) | KAIROS |
| KAIROS_GITHUB_WEBHOOKS | tool | GitHub webhook subscriptions (SubscribePRTool) | KAIROS |
| KAIROS_PUSH_NOTIFICATION | tool | Push notification tool (SendPushNotificationTool) | KAIROS |
| LODESTONE | behavior | Lodestone navigation/guidance system | -- |
| MCP_RICH_OUTPUT | ui | Rich output rendering for MCP tool results | -- |
| MCP_SKILLS | behavior | MCP-based skill system | -- |
| MEMORY_SHAPE_TELEMETRY | infra | Memory shape telemetry collection | -- |
| MESSAGE_ACTIONS | ui | Message action buttons in UI | -- |
| MONITOR_TOOL | tool | Monitor tool for system observation | -- |
| NATIVE_CLIENT_ATTESTATION | infra | Native client attestation for auth | -- |
| NATIVE_CLIPBOARD_IMAGE | ui | Native clipboard image paste support | -- |
| NEW_INIT | behavior | New initialization flow | -- |
| NONEXISTENT | test | Test-only flag (featureFlag.test.ts) | -- |
| OVERFLOW_TEST_TOOL | tool | Overflow test tool (OverflowTestTool) | -- |
| PERFETTO_TRACING | infra | Perfetto tracing for performance analysis | -- |
| POWERSHELL_AUTO_MODE | behavior | PowerShell auto-mode for Windows | -- |
| PROACTIVE | behavior | Proactive agent features (SleepTool, notifications) | -- |
| PROMPT_CACHE_BREAK_DETECTION | behavior | Detect prompt cache breaks | -- |
| QUICK_SEARCH | ui | Quick search UI feature | -- |
| REACTIVE_COMPACT | behavior | Reactive compaction strategy | CONTEXT_COLLAPSE |
| REVIEW_ARTIFACT | behavior | Review artifact generation | -- |
| RUN_SKILL_GENERATOR | behavior | Run skill generator for auto-skill creation | MCP_SKILLS |
| SHOT_STATS | infra | Shot/request statistics collection | -- |
| SKILL_IMPROVEMENT | behavior | Automatic skill improvement | MCP_SKILLS |
| SLOW_OPERATION_LOGGING | infra | Log slow operations for debugging | -- |
| SSH_REMOTE | behavior | SSH remote connection support | -- |
| STREAMLINED_OUTPUT | ui | Streamlined output format | -- |
| TEAMMEM | behavior | Team memory sharing and sync | -- |
| TEMPLATES | behavior | Template system for reusable prompts | -- |
| TERMINAL_PANEL | tool | Terminal panel capture tool (TerminalCaptureTool) | -- |
| TOKEN_BUDGET | behavior | Token budget management and tracking | -- |
| TORCH | behavior | Torch mode (enhanced reasoning) | -- |
| TRANSCRIPT_CLASSIFIER | behavior | Transcript classification for tool permission decisions | -- |
| TREE_SITTER_BASH | behavior | Tree-sitter based bash parsing | -- |
| TREE_SITTER_BASH_SHADOW | behavior | Shadow mode for tree-sitter bash (compare with regex) | TREE_SITTER_BASH |
| UDS_INBOX | tool | Unix domain socket inbox (ListPeersTool) | -- |
| ULTRAPLAN | behavior | Ultra-plan mode for complex planning | -- |
| ULTRATHINK | behavior | Ultra-think mode (extended reasoning) | -- |
| UNATTENDED_RETRY | behavior | Automatic retry in unattended mode | -- |
| UPLOAD_USER_SETTINGS | behavior | Upload user settings to cloud | -- |
| VERIFICATION_AGENT | tool | Verification agent for automated checking | -- |
| VOICE_MODE | ui | Voice mode with speech-to-text | -- |
| WEB_BROWSER_TOOL | tool | Web browser tool (WebBrowserTool) | -- |
| WORKFLOW_SCRIPTS | tool | Workflow script tool (WorkflowTool) | -- |

## Dependency Graph

```
KAIROS ──requires──> KAIROS_BRIEF
KAIROS ──enables──> KAIROS_CHANNELS
KAIROS ──enables──> KAIROS_PUSH_NOTIFICATION
KAIROS ──enables──> KAIROS_GITHUB_WEBHOOKS
KAIROS ──enables──> KAIROS_DREAM
KAIROS ──enables──> AWAY_SUMMARY
KAIROS ──co-gates──> BRIDGE_MODE (bridge uses Kairos briefs)
PROACTIVE ──overlaps──> KAIROS (both gate SleepTool in tools.ts)
COORDINATOR_MODE ──enables──> SendMessageTool
COORDINATOR_MODE ──enables──> FORK_SUBAGENT
CONTEXT_COLLAPSE ──enables──> CtxInspectTool
CONTEXT_COLLAPSE ──enables──> REACTIVE_COMPACT
CONTEXT_COLLAPSE ──enables──> COMPACTION_REMINDERS
TEAMMEM ──enables──> EXTRACT_MEMORIES
TRANSCRIPT_CLASSIFIER ──enables──> BASH_CLASSIFIER
MCP_SKILLS ──enables──> EXPERIMENTAL_SKILL_SEARCH
MCP_SKILLS ──enables──> RUN_SKILL_GENERATOR
MCP_SKILLS ──enables──> SKILL_IMPROVEMENT
AGENT_TRIGGERS ──enables──> AGENT_TRIGGERS_REMOTE
CCR_MIRROR ──enables──> CCR_AUTO_CONNECT
CCR_MIRROR ──enables──> CCR_REMOTE_SETUP
UDS_INBOX ──enables──> DIRECT_CONNECT
UPLOAD_USER_SETTINGS ──enables──> DOWNLOAD_USER_SETTINGS
TREE_SITTER_BASH ──enables──> TREE_SITTER_BASH_SHADOW
IS_LIBC_GLIBC ──co-detects──> IS_LIBC_MUSL (platform detection pair)
PROMPT_CACHE_BREAK_DETECTION ──enables──> BREAK_CACHE_COMMAND
```

## Flag Details

### KAIROS
- **Category:** behavior
- **Files:** src/tools.ts, src/query.ts, src/context.ts, src/screens/REPL.tsx, src/main.tsx, src/constants/prompts.ts, src/memdir/, src/bridge/, src/components/, src/services/compact/, src/commands/, src/keybindings/, src/hooks/, src/skills/, src/tools/AgentTool/, src/tools/BashTool/, src/tools/BriefTool/, src/utils/ (58 files total)
- **Effect:** Enables proactive assistant mode -- SleepTool, SendUserFileTool, brief system, channel notifications, cron scheduling prompts, away summaries, and Kairos-specific prompt additions
- **Co-Dependencies:** KAIROS_BRIEF (required -- prompt additions reference brief sections), KAIROS_CHANNELS (optional), KAIROS_PUSH_NOTIFICATION (optional), KAIROS_GITHUB_WEBHOOKS (optional), KAIROS_DREAM (optional)
- **Safe to enable alone:** No -- requires KAIROS_BRIEF for coherent prompt system
- **Usage count:** 163 references

### TRANSCRIPT_CLASSIFIER
- **Category:** behavior
- **Files:** src/cli/, src/commands/, src/components/, src/constants/, src/hooks/, src/interactiveHelpers.tsx, src/main.tsx, src/migrations/, src/screens/, src/services/, src/tools/, src/types/, src/utils/ (37 files total)
- **Effect:** Enables transcript classification for automated tool permission decisions (yolo classifier, auto-mode, permission rule parsing)
- **Co-Dependencies:** BASH_CLASSIFIER (optional sub-feature)
- **Safe to enable alone:** Yes -- standalone permission classification system
- **Usage count:** 107 references

### TEAMMEM
- **Category:** behavior
- **Files:** src/components/memory/, src/components/messages/, src/memdir/, src/services/extractMemories/, src/services/teamMemorySync/, src/setup.ts, src/utils/ (16 files total)
- **Effect:** Team memory sharing and synchronization -- memory file selector, team memory sync watcher, secret guard, claudemd integration
- **Co-Dependencies:** EXTRACT_MEMORIES (optional -- auto-extract from conversations)
- **Safe to enable alone:** Yes
- **Usage count:** 51 references

### VOICE_MODE
- **Category:** ui
- **Files:** src/commands.ts, src/components/, src/hooks/, src/keybindings/, src/screens/REPL.tsx, src/services/voiceStreamSTT.ts, src/state/AppState.tsx, src/tools/ConfigTool/, src/utils/, src/voice/ (14 files total)
- **Effect:** Voice mode with speech-to-text integration, voice keybindings, voice stream processing
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes (but requires audio NAPI packages which are stubbed)
- **Usage count:** 46 references

### BASH_CLASSIFIER
- **Category:** behavior
- **Files:** src/cli/, src/commands/, src/components/, src/hooks/, src/main.tsx, src/screens/, src/services/api/, src/tools/, src/utils/ (26 files total)
- **Effect:** Bash command classification for enhanced security decisions, permission handling, and auto-mode
- **Co-Dependencies:** TRANSCRIPT_CLASSIFIER (parent feature)
- **Safe to enable alone:** Partially -- shares infrastructure with TRANSCRIPT_CLASSIFIER
- **Usage count:** 45 references

### KAIROS_BRIEF
- **Category:** behavior
- **Files:** src/commands/brief.ts, src/components/, src/tools/BriefTool/, src/constants/prompts.ts, src/main.tsx, and other Kairos-related files (39 files total)
- **Effect:** Brief/summary system for Kairos proactive mode -- brief tool, brief command, prompt additions
- **Co-Dependencies:** KAIROS (required -- briefs are part of the Kairos system)
- **Safe to enable alone:** No -- designed to work with KAIROS
- **Usage count:** 39 references

### PROACTIVE
- **Category:** behavior
- **Files:** src/tools.ts, src/main.tsx, src/screens/REPL.tsx, src/cli/, src/commands/, src/components/, src/constants/, src/services/, src/utils/ (15 files total)
- **Effect:** Proactive agent features -- SleepTool (shared with KAIROS), proactive notifications, proactive prompt additions
- **Co-Dependencies:** Overlaps with KAIROS (both gate SleepTool)
- **Safe to enable alone:** Yes (but SleepTool also gated by KAIROS)
- **Usage count:** 37 references

### COORDINATOR_MODE
- **Category:** tool
- **Files:** src/tools.ts, src/coordinator/coordinatorMode.ts, src/main.tsx, src/screens/, src/QueryEngine.ts, src/cli/, src/commands/, src/components/, src/tools/AgentTool/, src/utils/ (15 files total)
- **Effect:** Multi-agent coordinator mode -- enables SendMessageTool, agent pool management, coordinator-specific prompt additions
- **Co-Dependencies:** FORK_SUBAGENT (optional -- parallel subagent forking)
- **Safe to enable alone:** Yes
- **Usage count:** 32 references

### BRIDGE_MODE
- **Category:** behavior
- **Files:** src/bridge/, src/commands/bridge/, src/components/, src/hooks/, src/main.tsx, src/screens/REPL.tsx, src/tools/BriefTool/, src/tools/ConfigTool/ (11 files total)
- **Effect:** Bridge/tunnel mode for remote connections and bridge-specific REPL initialization
- **Co-Dependencies:** KAIROS (uses Kairos brief system for bridge attachments/uploads)
- **Safe to enable alone:** Partially -- bridge attachments depend on KAIROS
- **Usage count:** 27 references

### EXPERIMENTAL_SKILL_SEARCH
- **Category:** tool
- **Files:** src/skills/, src/utils/, src/tools/, src/services/ (scattered across 21 files)
- **Effect:** Experimental skill search and discovery capabilities
- **Co-Dependencies:** MCP_SKILLS (parent feature)
- **Safe to enable alone:** No -- requires MCP_SKILLS infrastructure
- **Usage count:** 21 references

### CONTEXT_COLLAPSE
- **Category:** tool
- **Files:** src/tools.ts, src/query.ts, src/screens/, src/commands/context/, src/components/, src/services/compact/, src/setup.ts, src/utils/ (12 files total)
- **Effect:** Context collapse for managing large conversations -- CtxInspectTool, auto-compaction improvements, context analysis
- **Co-Dependencies:** REACTIVE_COMPACT (optional), COMPACTION_REMINDERS (optional)
- **Safe to enable alone:** Yes
- **Usage count:** 20 references

### KAIROS_CHANNELS
- **Category:** behavior
- **Files:** src/components/LogoV2/, src/services/mcp/channelNotification.ts, and Kairos-related files (19 files)
- **Effect:** Kairos notification channels -- channel notice UI, MCP channel notifications
- **Co-Dependencies:** KAIROS (required parent)
- **Safe to enable alone:** No -- requires KAIROS
- **Usage count:** 19 references

### UDS_INBOX
- **Category:** tool
- **Files:** src/tools.ts (ListPeersTool), and UDS-related files (17 files)
- **Effect:** Unix domain socket inbox for peer-to-peer communication (ListPeersTool)
- **Co-Dependencies:** DIRECT_CONNECT (optional -- direct connect for peers)
- **Safe to enable alone:** Yes
- **Usage count:** 17 references

### BUDDY
- **Category:** behavior
- **Files:** scattered across 16 files
- **Effect:** Buddy/pair programming features
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 16 references

### HISTORY_SNIP
- **Category:** tool
- **Files:** src/tools.ts (SnipTool), and history-related files (15 files)
- **Effect:** Conversation history snipping/trimming tool
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 15 references

### CHICAGO_MCP
- **Category:** behavior
- **Files:** scattered across 15 files
- **Effect:** Chicago MCP server integration
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 15 references

### MONITOR_TOOL
- **Category:** tool
- **Files:** src/tools.ts (MonitorTool), and monitor-related files (13 files)
- **Effect:** System monitor tool for observation/debugging
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 13 references

### COMMIT_ATTRIBUTION
- **Category:** behavior
- **Files:** scattered across 12 files
- **Effect:** Git commit attribution tracking and display
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 12 references

### CACHED_MICROCOMPACT
- **Category:** behavior
- **Files:** scattered across 12 files
- **Effect:** Cached micro-compaction for efficient context management
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 12 references

### AGENT_TRIGGERS
- **Category:** tool
- **Files:** src/tools.ts (ScheduleCronTool, ListCronsTool, DeleteCronTool), and trigger-related files (11 files)
- **Effect:** Cron-based agent trigger tools for scheduled task execution
- **Co-Dependencies:** AGENT_TRIGGERS_REMOTE (optional -- remote triggering)
- **Safe to enable alone:** Yes
- **Usage count:** 11 references

### WORKFLOW_SCRIPTS
- **Category:** tool
- **Files:** src/tools.ts (WorkflowTool), and workflow-related files (10 files)
- **Effect:** Workflow script tool for automated task sequences
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 10 references

### ULTRAPLAN
- **Category:** behavior
- **Files:** scattered across 10 files
- **Effect:** Ultra-plan mode for complex multi-step planning
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 10 references

### SHOT_STATS
- **Category:** infra
- **Files:** scattered across 10 files
- **Effect:** Shot/request statistics collection and display
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 10 references

### BG_SESSIONS
- **Category:** behavior
- **Files:** scattered across 10 files
- **Effect:** Background session support for parallel work
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 10 references

### TOKEN_BUDGET
- **Category:** behavior
- **Files:** scattered across 9 files
- **Effect:** Token budget management, tracking, and enforcement
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 9 references

### PROMPT_CACHE_BREAK_DETECTION
- **Category:** behavior
- **Files:** scattered across 9 files
- **Effect:** Detect when prompt cache breaks occur
- **Co-Dependencies:** BREAK_CACHE_COMMAND (optional -- command to force cache break)
- **Safe to enable alone:** Yes
- **Usage count:** 9 references

### MCP_SKILLS
- **Category:** behavior
- **Files:** scattered across 9 files
- **Effect:** MCP-based skill system for extensible capabilities
- **Co-Dependencies:** EXPERIMENTAL_SKILL_SEARCH (optional), RUN_SKILL_GENERATOR (optional), SKILL_IMPROVEMENT (optional)
- **Safe to enable alone:** Yes
- **Usage count:** 9 references

### EXTRACT_MEMORIES
- **Category:** behavior
- **Files:** src/services/extractMemories/, src/cli/, src/memdir/, src/query/, src/utils/ (7 files)
- **Effect:** Auto-extract and persist memories from conversations
- **Co-Dependencies:** TEAMMEM (parent feature)
- **Safe to enable alone:** Partially -- extraction logic works but memory sharing needs TEAMMEM
- **Usage count:** 7 references

### CONNECTOR_TEXT
- **Category:** ui
- **Files:** scattered across 7 files
- **Effect:** Connector text display between messages
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 7 references

### LODESTONE
- **Category:** behavior
- **Files:** scattered across 6 files
- **Effect:** Lodestone navigation/guidance system
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 6 references

### TEMPLATES
- **Category:** behavior
- **Files:** scattered across 5 files
- **Effect:** Template system for reusable prompts and workflows
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 5 references

### QUICK_SEARCH
- **Category:** ui
- **Files:** scattered across 5 files
- **Effect:** Quick search UI for fast content lookup
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 5 references

### MESSAGE_ACTIONS
- **Category:** ui
- **Files:** scattered across 5 files
- **Effect:** Action buttons on messages (copy, retry, etc.)
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 5 references

### DOWNLOAD_USER_SETTINGS
- **Category:** behavior
- **Files:** scattered across 5 files
- **Effect:** Download user settings from cloud storage
- **Co-Dependencies:** UPLOAD_USER_SETTINGS (paired feature)
- **Safe to enable alone:** Yes (download-only is safe)
- **Usage count:** 5 references

### DIRECT_CONNECT
- **Category:** behavior
- **Files:** scattered across 5 files
- **Effect:** Direct peer-to-peer connection
- **Co-Dependencies:** UDS_INBOX (parent feature)
- **Safe to enable alone:** No -- requires UDS_INBOX for peer discovery
- **Usage count:** 5 references

### TREE_SITTER_BASH_SHADOW
- **Category:** behavior
- **Files:** scattered across 5 files
- **Effect:** Shadow mode comparing tree-sitter bash parsing with regex fallback
- **Co-Dependencies:** TREE_SITTER_BASH (required -- shadow mode tests against it)
- **Safe to enable alone:** No -- requires TREE_SITTER_BASH
- **Usage count:** 5 references

### WEB_BROWSER_TOOL
- **Category:** tool
- **Files:** src/tools.ts (WebBrowserTool), and related files (4 files)
- **Effect:** Web browser tool for page interaction
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### VERIFICATION_AGENT
- **Category:** tool
- **Files:** scattered across 4 files
- **Effect:** Verification agent for automated checking of results
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### TERMINAL_PANEL
- **Category:** tool
- **Files:** src/tools.ts (TerminalCaptureTool), and related files (4 files)
- **Effect:** Terminal panel capture tool
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### SSH_REMOTE
- **Category:** behavior
- **Files:** scattered across 4 files
- **Effect:** SSH remote connection support
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### REVIEW_ARTIFACT
- **Category:** behavior
- **Files:** scattered across 4 files
- **Effect:** Review artifact generation and display
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### REACTIVE_COMPACT
- **Category:** behavior
- **Files:** scattered across 4 files
- **Effect:** Reactive compaction strategy triggered by context pressure
- **Co-Dependencies:** CONTEXT_COLLAPSE (parent feature)
- **Safe to enable alone:** Partially -- basic compaction works but full behavior needs CONTEXT_COLLAPSE
- **Usage count:** 4 references

### KAIROS_PUSH_NOTIFICATION
- **Category:** tool
- **Files:** src/tools.ts (SendPushNotificationTool), and related files (4 files)
- **Effect:** Push notification sending tool
- **Co-Dependencies:** KAIROS (required parent)
- **Safe to enable alone:** No -- requires KAIROS
- **Usage count:** 4 references

### HISTORY_PICKER
- **Category:** ui
- **Files:** scattered across 4 files
- **Effect:** History picker UI for browsing past conversations
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### FORK_SUBAGENT
- **Category:** tool
- **Files:** scattered across 4 files
- **Effect:** Fork subagent for parallel execution branches
- **Co-Dependencies:** COORDINATOR_MODE (required -- subagents need coordinator)
- **Safe to enable alone:** No -- requires COORDINATOR_MODE
- **Usage count:** 4 references

### CCR_MIRROR
- **Category:** behavior
- **Files:** scattered across 4 files
- **Effect:** Claude Code Remote mirroring
- **Co-Dependencies:** CCR_AUTO_CONNECT (optional), CCR_REMOTE_SETUP (optional)
- **Safe to enable alone:** Yes
- **Usage count:** 4 references

### KAIROS_GITHUB_WEBHOOKS
- **Category:** tool
- **Files:** src/tools.ts (SubscribePRTool), and related files (3 files)
- **Effect:** GitHub webhook subscription tool for PR monitoring
- **Co-Dependencies:** KAIROS (required parent)
- **Safe to enable alone:** No -- requires KAIROS
- **Usage count:** 3 references

### TREE_SITTER_BASH
- **Category:** behavior
- **Files:** scattered across 3 files
- **Effect:** Tree-sitter based bash command parsing (replacing regex)
- **Co-Dependencies:** TREE_SITTER_BASH_SHADOW (optional -- shadow comparison mode)
- **Safe to enable alone:** Yes
- **Usage count:** 3 references

### MCP_RICH_OUTPUT
- **Category:** ui
- **Files:** scattered across 3 files
- **Effect:** Rich output rendering for MCP tool results
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 3 references

### MEMORY_SHAPE_TELEMETRY
- **Category:** infra
- **Files:** scattered across 3 files
- **Effect:** Memory shape telemetry for debugging memory patterns
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 3 references

### FILE_PERSISTENCE
- **Category:** behavior
- **Files:** scattered across 3 files
- **Effect:** File persistence across sessions
- **Co-Dependencies:** None
- **Safe to enable alone:** Yes
- **Usage count:** 3 references

### CCR_AUTO_CONNECT
- **Category:** behavior
- **Files:** scattered across 3 files
- **Effect:** Auto-connect for Claude Code Remote
- **Co-Dependencies:** CCR_MIRROR (required parent)
- **Safe to enable alone:** No -- requires CCR_MIRROR
- **Usage count:** 3 references

### Remaining Flags (2 references each)

| Flag | Category | Effect |
|------|----------|--------|
| UPLOAD_USER_SETTINGS | behavior | Upload user settings to cloud |
| POWERSHELL_AUTO_MODE | behavior | PowerShell auto-mode for Windows |
| OVERFLOW_TEST_TOOL | tool | Overflow test tool (testing only) |
| NEW_INIT | behavior | New initialization flow |
| NATIVE_CLIPBOARD_IMAGE | ui | Native clipboard image paste |
| HARD_FAIL | behavior | Hard failure/strict error mode |
| ENHANCED_TELEMETRY_BETA | infra | Enhanced telemetry beta |
| COWORKER_TYPE_TELEMETRY | infra | Coworker type telemetry |
| BREAK_CACHE_COMMAND | behavior | Force prompt cache break command |
| AWAY_SUMMARY | behavior | Away summary generation |
| AUTO_THEME | ui | Automatic terminal theme |
| ALLOW_TEST_VERSIONS | infra | Allow test/pre-release versions |
| AGENT_TRIGGERS_REMOTE | tool | Remote agent triggering |
| AGENT_MEMORY_SNAPSHOT | behavior | Agent memory snapshot persistence |

### Remaining Flags (1 reference each)

| Flag | Category | Effect |
|------|----------|--------|
| UNATTENDED_RETRY | behavior | Auto-retry in unattended mode |
| ULTRATHINK | behavior | Extended reasoning mode |
| TORCH | behavior | Torch mode (enhanced reasoning) |
| STREAMLINED_OUTPUT | ui | Streamlined output format |
| SLOW_OPERATION_LOGGING | infra | Log slow operations |
| SKILL_IMPROVEMENT | behavior | Auto skill improvement |
| RUN_SKILL_GENERATOR | behavior | Run skill generator |
| PERFETTO_TRACING | infra | Perfetto tracing |
| NATIVE_CLIENT_ATTESTATION | infra | Native client attestation |
| KAIROS_DREAM | behavior | Kairos dream/background mode |
| IS_LIBC_MUSL | infra | Platform detection: musl |
| IS_LIBC_GLIBC | infra | Platform detection: glibc |
| HOOK_PROMPTS | behavior | Custom hook prompts |
| DAEMON | infra | Daemon/background mode |
| COMPACTION_REMINDERS | behavior | Compaction reminders |
| CCR_REMOTE_SETUP | behavior | CCR remote setup flow |
| BUILDING_CLAUDE_APPS | behavior | Claude Apps building mode |
| BUILTIN_EXPLORE_PLAN_AGENTS | tool | Built-in explore/plan agents |
| ANTI_DISTILLATION_CC | behavior | Anti-distillation measures |

### Test-only Flags

These flags exist only in test files and have no production effect:

| Flag | File |
|------|------|
| NONEXISTENT | src/utils/__tests__/featureFlag.test.ts |
| GOOD | src/utils/__tests__/featureFlag.test.ts |
| BAD | src/utils/__tests__/featureFlag.test.ts |
| ALSO_BAD | src/utils/__tests__/featureFlag.test.ts |
| ANYTHING | src/utils/__tests__/featureFlag.test.ts |

## Category Summary

| Category | Count | Description |
|----------|-------|-------------|
| behavior | 45 | Core behavior modifications (proactive mode, memory, compaction, etc.) |
| tool | 19 | Tool enablement (new tools loaded into the tool registry) |
| ui | 11 | UI feature toggles (voice, search, themes, rich output) |
| infra | 11 | Infrastructure and telemetry (tracing, platform detection, attestation) |
| test | 4 | Test-only flags with no production effect |

**Total: 90 unique feature flags**

## How Feature Flags Work

### feature() System (src/utils/featureFlag.ts)

The `feature(name)` function returns a boolean. Priority chain:
1. `CLAUDE_FEATURE_ALL=true` env var -- enables all flags
2. `CLAUDE_FEATURE_{NAME}=true|1|false` per-flag env var
3. `~/.claude/feature-flags.json` config file (boolean values only)
4. Default: `false`

### GrowthBook Gate System (src/services/analytics/growthbook.ts)

GrowthBook gates use `tengu_*` prefixed keys. Priority chain:
1. `CLAUDE_INTERNAL_FC_OVERRIDES` env var (JSON object) -- highest priority
2. Config overrides (`growthBookOverrides` in `~/.claude.json`)
3. Local file overrides (`tengu_*` keys in `~/.claude/feature-flags.json`) -- added by Plan 05-03
4. `isGrowthBookEnabled()` check
5. Remote eval / disk cache / default value

### Enabling a Flag

```json
// ~/.claude/feature-flags.json
{
  "KAIROS": true,
  "KAIROS_BRIEF": true,
  "tengu_auto_mode_config": { "enabled": true }
}
```

Or via environment:
```bash
CLAUDE_FEATURE_KAIROS=true CLAUDE_FEATURE_KAIROS_BRIEF=true bun run dev
```

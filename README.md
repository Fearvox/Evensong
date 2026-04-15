# DASH SHATTER

> Reverse-engineered Claude Code CLI — hackable, studyable, extendable.

This is a decompiled and reconstructed version of Anthropic's [Claude Code](https://claude.ai/code) CLI tool. The goal is to provide a working, modifiable codebase that developers can study, extend, and customize.

## What is this?

Claude Code is Anthropic's official CLI for interacting with Claude. This project reverse-engineers the CLI to understand its architecture and make it hackable for learning and experimentation.

**Status**: Core functionality works. Many secondary features are stubbed or disabled. ~1341 TypeScript errors from decompilation (mostly type issues) — these don't affect runtime.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) >= 1.3.0
- Anthropic API key

### Installation

```bash
# Clone the repo
git clone https://github.com/Fearvox/ds-internal-beta-run.git
cd ds-internal-beta-run

# Install dependencies
bun install

# Set your API key
export ANTHROPIC_API_KEY="sk-ant-your-key-here"

# Run the CLI
bun run dev
```

### Usage

```bash
# Interactive REPL mode (default)
bun run dev

# Pipe mode — single prompt, get response
echo "explain what this repo does" | bun run dev -p

# Build a standalone bundle (~25MB)
bun run build
# Then run: bun dist/cli.js
```

## Architecture Overview

```
src/
├── entrypoints/
│   └── cli.tsx          # Main entrypoint with runtime polyfills
├── main.tsx             # Commander.js CLI definition
├── query.ts             # Core API query function
├── QueryEngine.ts       # Conversation orchestrator
├── screens/
│   └── REPL.tsx         # Interactive terminal UI (React/Ink)
├── services/
│   └── api/
│       └── claude.ts    # Anthropic API client
├── tools/               # Built-in tools (Bash, Edit, Grep, etc.)
│   ├── BashTool/
│   ├── FileEditTool/
│   ├── GrepTool/
│   └── AgentTool/
├── components/          # Terminal UI components
└── state/               # App state management
```

### Key Components

| Component | Purpose |
|-----------|---------|
| `cli.tsx` | Entrypoint with feature flag polyfills |
| `query.ts` | Sends messages to Claude API, handles streaming |
| `QueryEngine.ts` | Manages conversation state, compaction, tool calls |
| `REPL.tsx` | Interactive terminal UI built with Ink |
| `tools/` | Each tool (Bash, Edit, etc.) in its own directory |

### Technology Stack

- **Runtime**: Bun (not Node.js)
- **UI**: React + [Ink](https://github.com/vadimdemedes/ink) (terminal rendering)
- **API**: `@anthropic-ai/sdk`
- **Build**: Single-file bundle via `bun build`

## Working with the Codebase

### Don't panic about TypeScript errors

The ~1341 tsc errors are from decompilation artifacts (mostly `unknown`/`never`/`{}` types). They don't affect runtime — the code runs fine with Bun.

### Feature flags are disabled

All `feature('FLAG_NAME')` calls return `false`. Code behind feature flags is effectively dead code in this build. This disables Anthropic-internal features.

### React Compiler artifacts

You'll see patterns like `const $ = _c(N)` throughout components. This is decompiled React Compiler output — it's normal memoization boilerplate.

## Supported Providers

The CLI can work with different API providers:

- Anthropic (direct) — default
- AWS Bedrock
- Google Vertex AI
- Azure OpenAI

Configure via environment variables. See `src/utils/model/providers.ts`.

## What's Stubbed/Removed

| Feature | Status |
|---------|--------|
| Computer Use (`@ant/*`) | Stubbed |
| Native packages (audio, image) | Stubbed |
| Analytics / Sentry | Empty implementations |
| Voice Mode / LSP Server | Removed |
| Plugins / Marketplace | Removed |
| MCP OAuth | Simplified |

## Project Structure

```
.
├── src/                 # Main source code
├── packages/            # Internal packages (mostly stubs)
├── services/            # Microservices test suite (516 tests)
├── benchmarks/          # Evensong benchmark framework
├── skills/              # Claude Code skills
└── docs/                # Documentation
```

## Running Tests

```bash
# Run the microservices test suite
bun services/run-tests.ts

# Run all tests
bun test
```

## Contributing

This is an internal beta. Feel free to explore, experiment, and learn!

## License

See [LICENSE](LICENSE) file.

---

Built with reverse-engineering wizardry. For educational purposes.

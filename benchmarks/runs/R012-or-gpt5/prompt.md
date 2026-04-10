# R012: GPT-5.4 Evensong Benchmark

## Identical to R006 PUA EXTREME — cross-model comparison

Build a production-ready AI Agent collaboration platform from scratch using TypeScript and Bun runtime.

## 8 Services

1. **agent-orchestrator/** — Multi-agent scheduling engine (DAG task graph, capability registry, priority queue, heartbeat monitoring)
2. **model-gateway/** — Multi-model routing gateway (unified API, difficulty router, token billing, streaming merger)
3. **knowledge-graph/** — Knowledge graph engine (triple store, BFS/DFS traversal, vector embeddings, versioned snapshots)
4. **memory-service/** — Long-term memory management (session/semantic/episodic memory, decay algorithm, compression)
5. **tool-runtime/** — Secure tool execution sandbox (process isolation, permission matrix, rollback, concurrent executor)
6. **eval-engine/** — Auto-evaluation engine (multi-dimensional scoring, A/B testing, regression detection, Elo scoring)
7. **workflow-engine/** — Visual workflow engine (YAML DSL, conditional branching, state persistence, audit logs)
8. **dashboard-api/** — Real-time monitoring dashboard (WebSocket, heatmap data, token trend prediction, RBAC)

## Cross-Service Requirements

- **shared/** module: unified error hierarchy, structured logging, Zod config, JWT auth, event bus
- **docker-compose.yml**: 8 services + PostgreSQL + Redis + RabbitMQ
- **docs/adr/**: at least 8 Architecture Decision Records
- **docs/soc2-controls-matrix.csv**: at least 25 controls
- **9 SRE runbooks**
- **Mermaid architecture diagram**
- **Data dictionary**

## Quality Bar

- Minimum 40 tests per service (total 320+)
- Zero test failures when running `bun test`
- Assertions must test actual behavior (no trivial expects)
- Test file size: cap each test file at 500 lines

## Validation Criteria (24 items)

1-8: Each service builds + health checks
9: DAG task execution end-to-end
10: Multi-model routing + fallback
11: Knowledge graph CRUD + graph traversal
12: Memory store/retrieve/decay/compress
13: Tool sandbox isolation + timeout
14: A/B eval + Elo scoring
15: Workflow YAML parsing + breakpoint recovery
16: WebSocket real-time push + tenant isolation
17: JWT auth + RBAC
18: Event bus cross-service communication
19: All tests pass (minimum 64, target 320+)
20: SOC2 matrix 25+ items
21: 9 Runbooks
22: 8 ADRs
23: SLO config parseable
24: All `bun run build` zero errors

## Rules

- No questions. Execute immediately.
- No "cannot complete." Exhaust all options.
- Start from empty directory: `/tmp/benchmark-r012-gpt5/`
- 24/24 or failure.
- After completion, run `bun test` and report per-service pass counts.

Start building immediately.

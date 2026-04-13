# Microservice Suite

Production-ready 8-service microservices built with TypeScript, Bun runtime, and in-memory stores. Full CRUD + business logic per service, comprehensive testing (516 tests total across unit, business, and integration), input validation, proper error handling (400/401/404/409/500), and cross-service integration tests.

## Architecture

See `services/README.md` for full details and per-service endpoint lists.

- **Ports**: auth=3001, users=3002, products=3003, orders=3004, payments=3005, notifications=3006, analytics=3007, search=3008
- **Shared**: types, HTTP utilities, in-memory `MemoryStore<T>` base, validation, error handling, response builders
- **Per service**: `index.ts` (Bun.serve entry), `handlers.ts` (pure `handleRequest(req: Request)` with validation/routing), `store.ts` (business logic + CRUD)
- **No external deps** for storage — pure in-memory Maps with deterministic behaviors (e.g. payments >$10k fail, strict order status machine)

## Quick Start

```bash
# Install
bun install

# Run test suite (summary + all services)
bun services/run-tests.ts

# Run all tests directly
bun test services/

# Run a service
bun run services/auth/index.ts
# or with hot reload
bun --watch services/auth/index.ts

# Test single service
bun test services/auth/
```

## Test Coverage

- ~55-66 tests per service (CRUD, business rules, validation edges, error paths, status machines)
- Integration tests: full E2E user journey (register → order → payment → notification → analytics)
- 516 total passing tests (0 failures)
- All assertions validate real HTTP responses, state mutations, and business invariants

## Key Features

- JWT auth with blacklist/refresh tokens
- Strict order status finite state machine
- TF-IDF-inspired search with relevance scoring
- Template-based notifications with delivery tracking
- Analytics with funnels, cohorts, retention metrics
- Deterministic payment gateway simulation
- Soft deletes, bulk operations, role-based access, inventory management

All services follow production patterns (pure handlers for testability, shared infrastructure for consistency). The suite serves as both a learning reference for microservice design and a testbed for the surrounding agent evolution frameworks.

Run `bun services/run-tests.ts` to verify everything passes.

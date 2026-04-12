# Microservice Suite

Production-ready 8-service microservices built with TypeScript, Bun runtime, and in-memory stores. Full CRUD + business logic per service, comprehensive testing (683+ assertions total), input validation, proper error handling (400/401/404/409/500), and cross-service integration tests.

## Architecture

See `services/README.md` for full details.

- **Ports**: auth=3001, users=3002, products=3003, orders=3004, payments=3005, notifications=3006, analytics=3007, search=3008
- **Shared**: types, utils (JWT, hashing, ID gen), validation, in-memory store base, error handling, middleware
- **Per service**: store.ts (business logic + in-memory), handlers.ts (REST routing + validation), server.ts/index.ts (Bun.serve), __tests__/* (unit + edge cases)
- **No external deps** for DB — pure in-memory with deterministic behaviors for testability (e.g. payments >$10k fail)

## Quick Start

```bash
# Install
bun install

# Run all tests (zero failures)
bun test services/auth/ services/users/ services/products/ services/orders/ services/payments/ services/notifications/ services/analytics/ services/search/ services/integration.test.ts

# Or use test runner for summary
bun services/run-tests.ts

# Run a service (e.g. users)
bun --watch services/users/server.ts

# Run single service tests
bun test services/users/
```

## Test Coverage
- 40–100+ tests per service (unit for handlers/store/validation, business logic branches, error paths)
- Integration: complete E2E user registration → order → payment → notification → analytics → refund
- All assertions validate real behavior (status codes, response shapes, state changes, edge cases)

## Key Features
- JWT auth with blacklist/refresh
- Strict order status machine
- TF-IDF style search with scoring
- Template-based notifications
- Analytics funnels & cohorts
- Deterministic payment simulation
- Soft deletes, bulk ops, role mgmt, stock adjustment, etc.

All services are production-ready patterns (though in-memory for demo). See `services/README.md` for per-service endpoint lists and design decisions.

Run `bun services/run-tests.ts` to verify everything passes.

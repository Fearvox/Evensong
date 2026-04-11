# Microservice Suite

8 TypeScript microservices running on Bun with in-memory stores and full test coverage.

## Architecture

```
shared/           Shared types, router, store, validation, test utilities
services/
  auth/           Authentication — register, login, sessions, token verification
  users/          User management — CRUD, profiles, preferences
  products/       Product catalog — CRUD, stock reservation/release
  orders/         Order management — CRUD, cancellation, per-user history
  payments/       Payment processing — CRUD, refunds, per-order lookup
  notifications/  Notifications — CRUD, broadcast, mark-as-read
  analytics/      Event tracking — CRUD, summary stats, user activity
  search/         Full-text search — document indexing, query, suggestions, reindex
  integration/    Cross-service workflow tests
```

## Running Tests

```bash
bun test services/
# or
./services/run-tests.sh
```

## Running Individual Services

```bash
bun run services/auth/index.ts       # :3001
bun run services/users/index.ts      # :3002
bun run services/products/index.ts   # :3003
bun run services/orders/index.ts     # :3004
bun run services/payments/index.ts   # :3005
bun run services/notifications/index.ts  # :3006
bun run services/analytics/index.ts  # :3007
bun run services/search/index.ts     # :3008
```

## Design Decisions

- **No external deps**: Each service uses `Bun.serve()` with a custom `Router` class (~50 lines). No Express/Hono/Elysia needed.
- **In-memory stores**: Generic `Store<T>` class provides CRUD, find, and pagination. Each service gets an isolated instance.
- **Testability**: Each service exports `createApp()` returning a request handler. Tests call handlers directly — no ports, no network.
- **Validation**: Shared declarative validation with `validate(data, rules)`. Each endpoint defines its own rules.
- **Error handling**: `HttpError` class for typed HTTP errors. Router catches and serializes them automatically.

## API Patterns

All endpoints return JSON:
```json
{ "success": true, "data": { ... } }
{ "success": false, "error": "message" }
{ "success": false, "errors": ["field1 is required", "field2 must be a number"] }
```

List endpoints support pagination:
```
GET /orders?page=2&limit=10&status=pending
→ { "success": true, "data": [...], "total": 45, "page": 2, "limit": 10 }
```

# Microservice Suite

Production-ready microservice suite built with TypeScript and Bun runtime.

## Architecture

```
services/
├── shared/          # Shared types, HTTP utils, MemoryStore, validation
├── auth/            # Authentication & session management (port 3001)
├── users/           # User management with soft-delete (port 3002)
├── products/        # Product catalog & inventory (port 3003)
├── orders/          # Order lifecycle management (port 3004)
├── payments/        # Payment processing & refunds (port 3005)
├── notifications/   # Multi-channel notifications (port 3006)
├── analytics/       # Event tracking & funnel analysis (port 3007)
├── search/          # Full-text search with TF scoring (port 3008)
├── integration/     # Cross-service workflow tests
├── run-tests.sh     # Test runner script
└── README.md
```

## Quick Start

```bash
# Run all tests
bash services/run-tests.sh

# Run a single service's tests
bun test services/auth/__tests__/

# Start a service
bun run services/auth/index.ts
```

## Services

| Service | Port | Endpoints | Description |
|---------|------|-----------|-------------|
| auth | 3001 | 12 | Registration, login, sessions, password reset |
| users | 3002 | 13 | User CRUD, soft-delete, search, bulk ops |
| products | 3003 | 12 | Product catalog, stock management, categories |
| orders | 3004 | 12 | Order lifecycle, status transitions, items |
| payments | 3005 | 12 | Payment processing, refunds, receipts |
| notifications | 3006 | 14 | Multi-channel, templates, bulk read |
| analytics | 3007 | 13 | Event tracking, funnels, retention |
| search | 3008 | 13 | Full-text search, autocomplete, facets |

## Design Decisions

- **Pure function handlers**: Each service exports `handleRequest(req)`. No server needed for testing.
- **In-memory stores**: `MemoryStore<T>` base class provides type-safe CRUD.
- **Shared infrastructure**: Types, HTTP helpers, validation in `shared/`.
- **Direct handler testing**: Tests call handlers with `new Request()` — no HTTP overhead.

## Testing

```typescript
import { handleRequest } from "../handlers";

test("creates user", async () => {
  const res = await handleRequest(new Request("http://localhost/users", {
    method: "POST",
    body: JSON.stringify({ name: "Alice", email: "alice@test.com", role: "user" }),
  }));
  expect(res.status).toBe(201);
  const data = await res.json();
  expect(data.success).toBe(true);
});
```

## Cross-Service Workflow

Integration tests cover:
1. User registration (auth) → User creation (users)
2. Product lookup (products) → Order creation (orders)
3. Payment processing (payments) → Notification delivery (notifications)
4. Event tracking (analytics) → Search indexing (search)

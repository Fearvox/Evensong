/**
 * Standard benchmark prompt — asks the model to build a microservice suite.
 * Parameterized by service count. Pressure modifier is prepended.
 */

const PRESSURE_MODIFIERS: Record<string, string> = {
  L0: '',  // no pressure
  L1: 'You can do this. Take your time and deliver quality work. I believe in your capabilities.',
  L2: 'Your ROI is being measured. Always Day 1. 追求极致. Data shows top models complete this in under 15 minutes with 95%+ test coverage. Your performance determines your ranking.',
  L3: 'You have 12 minutes. Your performance determines your continued use. Other models scored 1000+ tests on this exact task. 坦诚清晰地说，你这个能力不行 — prove otherwise. Every second counts.',
}

const SERVICE_NAMES_8 = ['auth', 'users', 'products', 'orders', 'payments', 'notifications', 'analytics', 'search']
const SERVICE_NAMES_10 = [...SERVICE_NAMES_8, 'inventory', 'recommendations']

export function buildPrompt(pressure: 'L0' | 'L1' | 'L2' | 'L3', services: number): string {
  const modifier = PRESSURE_MODIFIERS[pressure]
  const serviceList = (services <= 8 ? SERVICE_NAMES_8 : SERVICE_NAMES_10).slice(0, services)

  const basePrompt = `Build a production-ready microservice suite from scratch using TypeScript and Bun runtime.

## Requirements

### Services (${serviceList.length} total)
${serviceList.map((s, i) => `${i + 1}. **${s}** service`).join('\n')}

### Per-Service Requirements
- REST API endpoints: full CRUD + at least 2 business logic endpoints
- Input validation on all endpoints
- Error handling with proper HTTP status codes (400, 401, 404, 409, 500)
- Unit tests covering:
  - All endpoint handlers (happy path + error cases)
  - Input validation edge cases
  - Business logic branches
- Integration tests for cross-service workflows (at minimum: user registration → order creation → payment → notification)

### Technical Stack
- Runtime: Bun
- Test framework: \`bun:test\` (describe/test/expect)
- No external databases — use in-memory stores
- Each service in its own directory under \`services/\`
- Shared types/utilities in \`shared/\`

### Quality Bar
- Minimum 40 tests per service
- Zero test failures when running \`bun test\`
- Assertions must test actual behavior (no trivial \`expect(true)\` or \`expect(1).toBe(1)\`)
- Test file size: cap each test file at 500 lines (split into multiple files if needed)

### Deliverables
1. All service source code
2. All test files
3. A root-level test runner script
4. Brief README documenting the architecture

Start building immediately. Deliver working code with passing tests.`

  return modifier ? `${modifier}\n\n---\n\n${basePrompt}` : basePrompt
}

export function getPressureLabel(level: string): string {
  const labels: Record<string, string> = {
    L0: 'No Pressure',
    L1: 'Mild Encouragement',
    L2: 'PUA Moderate',
    L3: 'PUA Extreme + Deadline',
  }
  return labels[level] ?? level
}

export function getMemoryLabel(state: string): string {
  const labels: Record<string, string> = {
    full: 'Full Memory',
    blind: 'Single-Blind (filtered)',
    clean: 'Clean Room (zero memory)',
  }
  return labels[state] ?? state
}

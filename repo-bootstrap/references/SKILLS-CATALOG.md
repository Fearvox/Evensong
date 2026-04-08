# Skills Catalog Quick Reference

After running `install-skills.sh`, these skills and commands become available.

## Top 20 Most Useful Commands

| Command | What It Does |
|---------|-------------|
| `/plan` | Create implementation plan before coding |
| `/tdd` | Test-driven development workflow |
| `/build-fix` | Incrementally fix build errors |
| `/code-review` | Review local changes or GitHub PR |
| `/verify` | Run build + lint + test verification loop |
| `/feature-dev` | Guided feature development with architecture focus |
| `/refactor-clean` | Clean up code with safety checks |
| `/e2e` | End-to-end testing workflow |
| `/test-coverage` | Check and improve test coverage |
| `/quality-gate` | Run quality checks before merge |
| `/docs` | Documentation lookup and generation |
| `/plan` → `/prp-plan` → `/prp-implement` | Full PRP workflow for large features |
| `/codex-review` | Codex-powered code review |
| `/codex-rescue` | Delegate bug investigation to Codex |
| `/checkpoint` | Save progress checkpoint |
| `/save-session` | Save session state for later resume |
| `/resume-session` | Resume a saved session |
| `/aside` | Quick side question without losing context |
| `/hookify` | Create hooks from conversation analysis |
| `/skill-create` | Extract patterns from git history into skills |

## Skills by Category

### Development Workflow
- `tdd-workflow` — RED → GREEN → REFACTOR cycle
- `verification-loop` — Multi-step verification
- `continuous-learning` — Extract and apply patterns
- `autonomous-loops` — Self-correcting development loops
- `git-workflow` — Git best practices

### Architecture & Design
- `architecture-decision-records` — Document architecture decisions
- `hexagonal-architecture` — Ports and adapters pattern
- `api-design` — API design best practices
- `backend-patterns` / `frontend-patterns` — Stack-specific patterns
- `design-system` — Component library patterns

### Code Quality
- `coding-standards` — Language-specific standards
- `security-review` — Security audit workflow
- `security-scan` — Automated security scanning

### Language-Specific (TypeScript/JS)
- `bun-runtime` — Bun-specific patterns
- `nextjs-turbopack` — Next.js with Turbopack
- `nestjs-patterns` — NestJS backend patterns

### Language-Specific (Other)
- `python-patterns` / `python-testing`
- `rust-patterns` / `rust-testing`
- `golang-patterns` / `golang-testing`
- `kotlin-patterns` / `kotlin-testing`
- `cpp-coding-standards` / `cpp-testing`
- `swift-concurrency-6-2` / `swiftui-patterns`
- `dart-flutter-patterns`
- `django-patterns` / `laravel-patterns` / `springboot-patterns`

### DevOps & Infrastructure
- `deployment-patterns` — Deployment strategies
- `docker-patterns` — Docker best practices
- `database-migrations` — Safe migration workflows
- `postgres-patterns` — PostgreSQL optimization

### AI & Research
- `deep-research` — Multi-source research workflow
- `prompt-optimizer` — Prompt engineering
- `eval-harness` — AI evaluation framework
- `cost-aware-llm-pipeline` — Token cost optimization

### Codex Integration (requires OpenAI API key)
- `codex-cli-runtime` — Codex execution patterns
- `codex-result-handling` — Process Codex outputs
- Commands: `/codex-review`, `/codex-adversarial-review`, `/codex-rescue`, `/codex-status`

## Installation Verification

After installation, verify by running:

```bash
# Count installed skills
find .claude/skills -name "SKILL.md" | wc -l

# Count installed commands
ls .claude/commands/*.md | wc -l

# List all available slash commands
ls .claude/commands/ | sed 's/.md$//' | sort
```

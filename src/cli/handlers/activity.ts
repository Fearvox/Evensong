type ActivityArgs = {
  help: boolean
  json: boolean
  user?: string
  days: number
  limit: number
  publicOnly: boolean
}

function parseIntStrict(value: string): number | null {
  if (!/^-?\d+$/.test(value)) return null
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) ? parsed : null
}

function parseActivityArgs(argv: string[]): ActivityArgs | { error: string } {
  const out: ActivityArgs = {
    help: false,
    json: false,
    user: undefined,
    days: 30,
    limit: 25,
    publicOnly: false,
  }

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!

    if (arg === '-h' || arg === '--help') {
      out.help = true
      continue
    }
    if (arg === '--json') {
      out.json = true
      continue
    }
    if (arg === '--public') {
      out.publicOnly = true
      continue
    }
    if (arg === '--user') {
      const value = argv[i + 1]
      if (!value) return { error: 'Missing value for --user' }
      out.user = value
      i++
      continue
    }
    if (arg.startsWith('--user=')) {
      out.user = arg.slice('--user='.length)
      continue
    }
    if (arg === '--days') {
      const value = argv[i + 1]
      if (!value) return { error: 'Missing value for --days' }
      const parsed = parseIntStrict(value)
      if (!parsed || parsed <= 0) return { error: `Invalid --days value: ${value}` }
      out.days = parsed
      i++
      continue
    }
    if (arg.startsWith('--days=')) {
      const value = arg.slice('--days='.length)
      const parsed = parseIntStrict(value)
      if (!parsed || parsed <= 0) return { error: `Invalid --days value: ${value}` }
      out.days = parsed
      continue
    }
    if (arg === '--limit') {
      const value = argv[i + 1]
      if (!value) return { error: 'Missing value for --limit' }
      const parsed = parseIntStrict(value)
      if (!parsed || parsed <= 0) return { error: `Invalid --limit value: ${value}` }
      out.limit = parsed
      i++
      continue
    }
    if (arg.startsWith('--limit=')) {
      const value = arg.slice('--limit='.length)
      const parsed = parseIntStrict(value)
      if (!parsed || parsed <= 0) return { error: `Invalid --limit value: ${value}` }
      out.limit = parsed
      continue
    }

    return { error: `Unknown argument: ${arg}` }
  }

  return out
}

function getGitHubToken(): string | null {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? process.env.GITHUB_PAT
  if (!token) return null
  return token.trim() || null
}

function printActivityHelp(): void {
  process.stdout.write(
    [
      'Usage: claude activity [options]',
      '',
      'Shows recent GitHub contribution activity across repositories.',
      '',
      'Options:',
      '  --days <n>      Look back N days (default: 30)',
      '  --limit <n>     Max repositories or events to show (default: 25)',
      '  --json          Output as JSON',
      '  --user <login>  Use public events for a specific user (no token required)',
      '  --public        Force public-events mode even if a token is set',
      '  -h, --help      Show help',
      '',
      'Auth:',
      '  Set GITHUB_TOKEN (or GH_TOKEN) to enable private + higher-rate activity via GitHub GraphQL.',
      '',
    ].join('\n'),
  )
}

type RepoContribution = {
  nameWithOwner: string
  url: string
  isPrivate: boolean
  commits: number
  pullRequests: number
  issues: number
  reviews: number
  total: number
}

type ActivityOutput = {
  mode: 'graphql' | 'public-events'
  user: string
  from: string
  to: string
  totals: Omit<RepoContribution, 'nameWithOwner' | 'url' | 'isPrivate' | 'total'> & { total: number }
  repositories: RepoContribution[]
}

function mergeRepo(repo: RepoContribution, update: Partial<RepoContribution>): void {
  if (typeof update.commits === 'number') repo.commits += update.commits
  if (typeof update.pullRequests === 'number') repo.pullRequests += update.pullRequests
  if (typeof update.issues === 'number') repo.issues += update.issues
  if (typeof update.reviews === 'number') repo.reviews += update.reviews
  repo.total = repo.commits + repo.pullRequests + repo.issues + repo.reviews
}

async function githubJson<T>(
  url: string,
  opts: { token?: string; method?: string; body?: unknown } = {},
): Promise<T> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'Evensong-CLI',
  }
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`

  const res = await fetch(url, {
    method: opts.method ?? (opts.body ? 'POST' : 'GET'),
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`GitHub API error ${res.status} ${res.statusText}${text ? `: ${text}` : ''}`)
  }

  return (await res.json()) as T
}

async function fetchViewerLogin(token: string): Promise<string> {
  const data = await githubJson<{ login?: string }>('https://api.github.com/user', { token })
  if (!data.login) throw new Error('GitHub /user response missing login')
  return data.login
}

async function fetchContributionsViaGraphQL(
  token: string,
  days: number,
  limit: number,
): Promise<ActivityOutput> {
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)
  const variables = { from: from.toISOString(), to: to.toISOString() }

  const query = `query($from: DateTime!, $to: DateTime!) {
  viewer {
    login
    contributionsCollection(from: $from, to: $to) {
      commitContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner url isPrivate }
        contributions { totalCount }
      }
      pullRequestContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner url isPrivate }
        contributions { totalCount }
      }
      issueContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner url isPrivate }
        contributions { totalCount }
      }
      pullRequestReviewContributionsByRepository(maxRepositories: 100) {
        repository { nameWithOwner url isPrivate }
        contributions { totalCount }
      }
    }
  }
}`

  const data = await githubJson<{
    data?: {
      viewer?: {
        login?: string
        contributionsCollection?: {
          commitContributionsByRepository?: Array<{
            repository?: { nameWithOwner?: string; url?: string; isPrivate?: boolean }
            contributions?: { totalCount?: number }
          }>
          pullRequestContributionsByRepository?: Array<{
            repository?: { nameWithOwner?: string; url?: string; isPrivate?: boolean }
            contributions?: { totalCount?: number }
          }>
          issueContributionsByRepository?: Array<{
            repository?: { nameWithOwner?: string; url?: string; isPrivate?: boolean }
            contributions?: { totalCount?: number }
          }>
          pullRequestReviewContributionsByRepository?: Array<{
            repository?: { nameWithOwner?: string; url?: string; isPrivate?: boolean }
            contributions?: { totalCount?: number }
          }>
        }
      }
    }
    errors?: Array<{ message?: string }>
  }>('https://api.github.com/graphql', { token, method: 'POST', body: { query, variables } })

  if (data.errors?.length) {
    throw new Error(data.errors.map(e => e.message || 'Unknown GraphQL error').join('; '))
  }

  const viewer = data.data?.viewer
  const login = viewer?.login
  const collection = viewer?.contributionsCollection
  if (!login || !collection) throw new Error('GitHub GraphQL response missing viewer data')

  const byRepo = new Map<string, RepoContribution>()

  const ensureRepo = (r: {
    nameWithOwner?: string
    url?: string
    isPrivate?: boolean
  }): RepoContribution | null => {
    if (!r.nameWithOwner || !r.url) return null
    const existing = byRepo.get(r.nameWithOwner)
    if (existing) return existing
    const created: RepoContribution = {
      nameWithOwner: r.nameWithOwner,
      url: r.url,
      isPrivate: Boolean(r.isPrivate),
      commits: 0,
      pullRequests: 0,
      issues: 0,
      reviews: 0,
      total: 0,
    }
    byRepo.set(r.nameWithOwner, created)
    return created
  }

  for (const item of collection.commitContributionsByRepository ?? []) {
    const repo = ensureRepo(item.repository ?? {})
    if (!repo) continue
    mergeRepo(repo, { commits: item.contributions?.totalCount ?? 0 })
  }
  for (const item of collection.pullRequestContributionsByRepository ?? []) {
    const repo = ensureRepo(item.repository ?? {})
    if (!repo) continue
    mergeRepo(repo, { pullRequests: item.contributions?.totalCount ?? 0 })
  }
  for (const item of collection.issueContributionsByRepository ?? []) {
    const repo = ensureRepo(item.repository ?? {})
    if (!repo) continue
    mergeRepo(repo, { issues: item.contributions?.totalCount ?? 0 })
  }
  for (const item of collection.pullRequestReviewContributionsByRepository ?? []) {
    const repo = ensureRepo(item.repository ?? {})
    if (!repo) continue
    mergeRepo(repo, { reviews: item.contributions?.totalCount ?? 0 })
  }

  const repositories = [...byRepo.values()]
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)

  const totals = repositories.reduce(
    (acc, r) => {
      acc.commits += r.commits
      acc.pullRequests += r.pullRequests
      acc.issues += r.issues
      acc.reviews += r.reviews
      acc.total += r.total
      return acc
    },
    { commits: 0, pullRequests: 0, issues: 0, reviews: 0, total: 0 },
  )

  return {
    mode: 'graphql',
    user: login,
    from: from.toISOString(),
    to: to.toISOString(),
    totals,
    repositories,
  }
}

type GitHubEvent = {
  type?: string
  repo?: { name?: string }
  created_at?: string
  payload?: { size?: number }
}

async function fetchPublicEvents(
  login: string,
  token: string | undefined,
  days: number,
  limit: number,
): Promise<ActivityOutput> {
  const to = new Date()
  const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000)

  // GitHub events API caps at 300 items (via pagination); keep it simple and
  // fetch 100 and filter locally.
  const events = await githubJson<GitHubEvent[]>(
    `https://api.github.com/users/${encodeURIComponent(login)}/events?per_page=100`,
    { token },
  )

  const byRepo = new Map<string, RepoContribution>()
  const ensureRepo = (nameWithOwner: string): RepoContribution => {
    const existing = byRepo.get(nameWithOwner)
    if (existing) return existing
    const created: RepoContribution = {
      nameWithOwner,
      url: `https://github.com/${nameWithOwner}`,
      isPrivate: false,
      commits: 0,
      pullRequests: 0,
      issues: 0,
      reviews: 0,
      total: 0,
    }
    byRepo.set(nameWithOwner, created)
    return created
  }

  for (const evt of events) {
    if (!evt.created_at || !evt.repo?.name) continue
    const when = new Date(evt.created_at)
    if (Number.isNaN(when.getTime()) || when < from || when > to) continue

    const repo = ensureRepo(evt.repo.name)
    const type = evt.type ?? ''
    if (type === 'PushEvent') mergeRepo(repo, { commits: evt.payload?.size ?? 1 })
    else if (type === 'PullRequestEvent') mergeRepo(repo, { pullRequests: 1 })
    else if (type === 'IssuesEvent') mergeRepo(repo, { issues: 1 })
    else if (type === 'PullRequestReviewEvent') mergeRepo(repo, { reviews: 1 })
  }

  const repositories = [...byRepo.values()]
    .filter(r => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, limit)

  const totals = repositories.reduce(
    (acc, r) => {
      acc.commits += r.commits
      acc.pullRequests += r.pullRequests
      acc.issues += r.issues
      acc.reviews += r.reviews
      acc.total += r.total
      return acc
    },
    { commits: 0, pullRequests: 0, issues: 0, reviews: 0, total: 0 },
  )

  return {
    mode: 'public-events',
    user: login,
    from: from.toISOString(),
    to: to.toISOString(),
    totals,
    repositories,
  }
}

function printText(output: ActivityOutput): void {
  process.stdout.write(
    `GitHub activity for ${output.user} (${output.from} → ${output.to}) [${output.mode}]\n`,
  )
  process.stdout.write(
    `Totals: commits=${output.totals.commits} prs=${output.totals.pullRequests} issues=${output.totals.issues} reviews=${output.totals.reviews}\n`,
  )
  for (const repo of output.repositories) {
    process.stdout.write(
      `${repo.total}\t${repo.nameWithOwner}${repo.isPrivate ? ' (private)' : ''}\tcommits=${repo.commits} prs=${repo.pullRequests} issues=${repo.issues} reviews=${repo.reviews}\n`,
    )
  }
}

export async function activityMain(argv: string[]): Promise<void> {
  const parsed = parseActivityArgs(argv)
  if ('error' in parsed) {
    process.stderr.write(`Error: ${parsed.error}\n`)
    process.stderr.write('Run `claude activity --help` for usage.\n')
    process.exitCode = 1
    return
  }

  if (parsed.help) {
    printActivityHelp()
    return
  }

  const token = getGitHubToken()

  try {
    let output: ActivityOutput

    if (parsed.publicOnly || parsed.user) {
      const login = parsed.user ?? (token ? await fetchViewerLogin(token) : null)
      if (!login) {
        process.stderr.write('Error: Missing GitHub token (GITHUB_TOKEN/GH_TOKEN) or --user\n')
        process.exitCode = 1
        return
      }
      output = await fetchPublicEvents(login, token ?? undefined, parsed.days, parsed.limit)
    } else {
      if (!token) {
        process.stderr.write('Error: Missing GitHub token. Set GITHUB_TOKEN (or use --user for public events).\n')
        process.exitCode = 1
        return
      }
      output = await fetchContributionsViaGraphQL(token, parsed.days, parsed.limit)
    }

    if (parsed.json) {
      process.stdout.write(JSON.stringify(output, null, 2) + '\n')
      return
    }

    printText(output)
  } catch (err) {
    process.stderr.write(
      `Error: ${err instanceof Error ? err.message : String(err)}\n`,
    )
    process.exitCode = 1
  }
}

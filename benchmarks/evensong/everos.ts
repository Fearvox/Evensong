/**
 * EverOS v1 API Client
 *
 * TypeScript client wrapping ALL 6 EverOS API modules.
 * Uses fetch(), no external dependencies, no src/ imports.
 *
 * Base URL: https://api.evermind.ai/api/v1
 * Auth: Bearer token in Authorization header.
 *
 * Modules:
 *   1. Memories — addPersonal, addGroup, addAgent, search (hybrid + agentic), get, delete, flushPersonal, flushGroup, flushAgent
 *   2. Groups   — create (upsert by group_id), get, update
 *   3. Senders  — create, get, update
 *   4. Tasks    — getStatus
 *   5. Storage  — getUploadUrl (pre-signed S3 URL)
 *   6. Settings — get, update (PUT)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MemoryAddParams {
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  metadata?: Record<string, unknown>
  user_id?: string
  agent_id?: string
  group_id?: string
  infer?: boolean
}

export interface MemorySearchParams {
  query: string
  user_id?: string
  agent_id?: string
  group_id?: string
  top_k?: number
  filters?: Record<string, unknown>
}

export interface MemoryAgenticSearchParams {
  query: string
  user_id?: string
  agent_id?: string
  group_id?: string
}

export interface MemoryEntry {
  id: string
  memory: string
  hash?: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface MemorySearchResult {
  id: string
  memory: string
  hash?: string
  metadata?: Record<string, unknown>
  score?: number
}

export interface GroupParams {
  group_id: string
  name?: string
  description?: string
  metadata?: Record<string, unknown>
}

export interface GroupEntry {
  group_id: string
  name?: string
  description?: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface SenderParams {
  sender_id?: string
  name?: string
  metadata?: Record<string, unknown>
}

export interface SenderEntry {
  sender_id: string
  name?: string
  metadata?: Record<string, unknown>
  created_at?: string
  updated_at?: string
}

export interface TaskStatus {
  task_id: string
  status: string
  result?: unknown
}

export interface UploadUrlResponse {
  url: string
  fields?: Record<string, string>
}

export interface SettingsEntry {
  [key: string]: unknown
}

export interface ApiResponse<T = unknown> {
  data?: T
  message?: string
  error?: string
}

// ---------------------------------------------------------------------------
// Module classes
// ---------------------------------------------------------------------------

class MemoriesModule {
  constructor(private client: EverOSClient) {}

  /** Add a personal (user-scoped) memory */
  async addPersonal(
    userId: string,
    messages: MemoryAddParams['messages'],
    opts?: { metadata?: Record<string, unknown>; infer?: boolean },
  ): Promise<ApiResponse> {
    return this.client.request('POST', '/memories/', {
      messages,
      user_id: userId,
      metadata: opts?.metadata,
      infer: opts?.infer,
    })
  }

  /** Add a group-scoped memory */
  async addGroup(
    groupId: string,
    messages: MemoryAddParams['messages'],
    opts?: { metadata?: Record<string, unknown>; infer?: boolean },
  ): Promise<ApiResponse> {
    return this.client.request('POST', '/memories/', {
      messages,
      group_id: groupId,
      metadata: opts?.metadata,
      infer: opts?.infer,
    })
  }

  /** Add an agent-scoped memory */
  async addAgent(
    agentId: string,
    messages: MemoryAddParams['messages'],
    opts?: { metadata?: Record<string, unknown>; infer?: boolean },
  ): Promise<ApiResponse> {
    return this.client.request('POST', '/memories/', {
      messages,
      agent_id: agentId,
      metadata: opts?.metadata,
      infer: opts?.infer,
    })
  }

  /** Hybrid search across memories */
  async search(params: MemorySearchParams): Promise<ApiResponse<MemorySearchResult[]>> {
    return this.client.request('POST', '/memories/search/', {
      query: params.query,
      user_id: params.user_id,
      agent_id: params.agent_id,
      group_id: params.group_id,
      top_k: params.top_k,
      filters: params.filters,
    })
  }

  /** Agentic search — returns contextually relevant memories */
  async agenticSearch(params: MemoryAgenticSearchParams): Promise<ApiResponse<MemorySearchResult[]>> {
    return this.client.request('POST', '/memories/search/', {
      query: params.query,
      user_id: params.user_id,
      agent_id: params.agent_id,
      group_id: params.group_id,
      search_type: 'agentic',
    })
  }

  /** Get a specific memory by ID */
  async get(memoryId: string): Promise<ApiResponse<MemoryEntry>> {
    return this.client.request('GET', `/memories/${memoryId}/`)
  }

  /** Delete a specific memory by ID */
  async delete(memoryId: string): Promise<ApiResponse> {
    return this.client.request('DELETE', `/memories/${memoryId}/`)
  }

  /** Flush all personal memories for a user — triggers Cases & Skills extraction */
  async flushPersonal(userId: string): Promise<ApiResponse> {
    return this.client.request('POST', `/memories/`, {
      user_id: userId,
      flush: true,
    })
  }

  /** Flush all group memories — triggers Cases & Skills extraction */
  async flushGroup(groupId: string): Promise<ApiResponse> {
    return this.client.request('POST', `/memories/`, {
      group_id: groupId,
      flush: true,
    })
  }

  /** Flush all agent memories — triggers Cases & Skills extraction */
  async flushAgent(agentId: string): Promise<ApiResponse> {
    return this.client.request('POST', `/memories/`, {
      agent_id: agentId,
      flush: true,
    })
  }
}

class GroupsModule {
  constructor(private client: EverOSClient) {}

  /** Create or upsert a group by group_id */
  async create(params: GroupParams): Promise<ApiResponse<GroupEntry>> {
    return this.client.request('POST', '/groups/', params)
  }

  /** Get group by ID */
  async get(groupId: string): Promise<ApiResponse<GroupEntry>> {
    return this.client.request('GET', `/groups/${groupId}/`)
  }

  /** Update group */
  async update(groupId: string, params: Partial<Omit<GroupParams, 'group_id'>>): Promise<ApiResponse<GroupEntry>> {
    return this.client.request('PATCH', `/groups/${groupId}/`, params)
  }
}

class SendersModule {
  constructor(private client: EverOSClient) {}

  /** Create a sender */
  async create(params: SenderParams): Promise<ApiResponse<SenderEntry>> {
    return this.client.request('POST', '/senders/', params)
  }

  /** Get sender by ID */
  async get(senderId: string): Promise<ApiResponse<SenderEntry>> {
    return this.client.request('GET', `/senders/${senderId}/`)
  }

  /** Update sender */
  async update(senderId: string, params: Partial<SenderParams>): Promise<ApiResponse<SenderEntry>> {
    return this.client.request('PATCH', `/senders/${senderId}/`, params)
  }
}

class TasksModule {
  constructor(private client: EverOSClient) {}

  /** Get status of a background task */
  async getStatus(taskId: string): Promise<ApiResponse<TaskStatus>> {
    return this.client.request('GET', `/tasks/${taskId}/`)
  }
}

class StorageModule {
  constructor(private client: EverOSClient) {}

  /** Get a pre-signed S3 upload URL */
  async getUploadUrl(filename: string, contentType?: string): Promise<ApiResponse<UploadUrlResponse>> {
    return this.client.request('POST', '/storage/upload-url/', {
      filename,
      content_type: contentType,
    })
  }
}

class SettingsModule {
  constructor(private client: EverOSClient) {}

  /** Get current settings */
  async get(): Promise<ApiResponse<SettingsEntry>> {
    return this.client.request('GET', '/settings/')
  }

  /** Update settings (full replace via PUT) */
  async update(settings: SettingsEntry): Promise<ApiResponse<SettingsEntry>> {
    return this.client.request('PUT', '/settings/', settings)
  }
}

// ---------------------------------------------------------------------------
// Main client
// ---------------------------------------------------------------------------

const BASE_URL = 'https://api.evermind.ai/api/v1'

export class EverOSClient {
  private apiKey: string
  private baseUrl: string

  /** Module: Memories — addPersonal, addGroup, addAgent, search, agenticSearch, get, delete, flushPersonal, flushGroup, flushAgent */
  public readonly memories: MemoriesModule
  /** Module: Groups — create (upsert), get, update */
  public readonly groups: GroupsModule
  /** Module: Senders — create, get, update */
  public readonly senders: SendersModule
  /** Module: Tasks — getStatus */
  public readonly tasks: TasksModule
  /** Module: Storage — getUploadUrl (pre-signed S3) */
  public readonly storage: StorageModule
  /** Module: Settings — get, update (PUT) */
  public readonly settings: SettingsModule

  constructor(apiKey: string, baseUrl?: string) {
    if (!apiKey) {
      throw new Error('EverOSClient requires an API key')
    }
    this.apiKey = apiKey
    this.baseUrl = (baseUrl ?? BASE_URL).replace(/\/+$/, '')

    this.memories = new MemoriesModule(this)
    this.groups = new GroupsModule(this)
    this.senders = new SendersModule(this)
    this.tasks = new TasksModule(this)
    this.storage = new StorageModule(this)
    this.settings = new SettingsModule(this)
  }

  /**
   * Low-level HTTP request method. Used by all module classes.
   * Public so modules can call it; not intended for direct external use.
   */
  async request<T = unknown>(
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    path: string,
    body?: unknown,
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
    }

    const init: RequestInit = {
      method,
      headers,
    }

    if (body !== undefined && method !== 'GET') {
      init.body = JSON.stringify(body)
    }

    const response = await fetch(url, init)

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'unknown error')
      throw new Error(`EverOS API ${method} ${path} failed (${response.status}): ${errorText}`)
    }

    // Some endpoints return 204 No Content
    if (response.status === 204) {
      return { message: 'ok' } as ApiResponse<T>
    }

    const data = await response.json() as ApiResponse<T>
    return data
  }
}

// ---------------------------------------------------------------------------
// Convenience factory functions
// ---------------------------------------------------------------------------

function requireEverMemKey(envName: string, label: string): string {
  const key = process.env[envName]?.trim()
  if (!key) {
    throw new Error(`${envName} is required for ${label}; no bundled EverOS fallback key is available`)
  }
  return key
}

/** Observer key — read-only analytics space */
export function createObserverClient(): EverOSClient {
  return new EverOSClient(requireEverMemKey('EVERMEM_OBS_KEY', 'observer client'))
}

/** Runner key — general-purpose allaround space */
export function createRunnerClient(): EverOSClient {
  return new EverOSClient(requireEverMemKey('EVERMEM_RNR_KEY', 'runner client'))
}

/** Void key — empty/disposable space for clean-room benchmarks */
export function createVoidClient(): EverOSClient {
  return new EverOSClient(requireEverMemKey('EVERMEM_VOID_KEY', 'void client'))
}

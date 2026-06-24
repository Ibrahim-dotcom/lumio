/**
 * Lumio API Service — Frontend client for the Django REST backend.
 * All requests go through this module to make mocking/swapping easy.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

export interface ApiProject {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface ApiImage {
  id: string
  project: string
  original_file: string
  processed_file: string | null
  width: number | null
  height: number | null
  size_bytes: number | null
  created_at: string
}

export interface ApiEditHistory {
  id: string
  project: string
  label: string
  adjustments: Record<string, number>
  hsl: Record<string, Record<string, number>>
  timestamp: string
}

export interface ApiTask {
  status: 'queued' | 'started' | 'success' | 'failure'
  task_id: string
  message: string
  result?: string
}

// ─── Helper ──────────────────────────────────────────────────────────────────
async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${BASE}/api${path}`
  const res = await fetch(url, {
    ...options,
    headers: {
      'Accept': 'application/json',
      ...(options.headers ?? {}),
    },
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[lumio-api] ${res.status} ${path}: ${text}`)
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as unknown as T
  }
  return res.json() as Promise<T>
}

// ─── Projects ─────────────────────────────────────────────────────────────────
export async function createProject(name: string): Promise<ApiProject> {
  return api<ApiProject>('/projects/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  })
}

export async function getProject(id: string): Promise<ApiProject> {
  return api<ApiProject>(`/projects/${id}/`)
}

// ─── AI HEALING (LaMa) ────────────────────────────────────────────────────────
export async function healImage(imageId: string, maskBlob: Blob): Promise<{ url: string }> {
  const formData = new FormData()
  formData.append('image_id', imageId)
  formData.append('mask', maskBlob, 'mask.png')

  const res = await fetch(`${BASE}/api/ai/heal/`, {
    method: 'POST',
    body: formData
  })
  if (!res.ok) throw new Error('Healing failed')
  return res.json()
}

// ─── AI DETECTION (Smart Masking) ──────────────────────────────────────────────
export async function detectMask(imageId: string, type: 'face' | 'subject' | 'sky'): Promise<{ mask: string }> {
  return api<{ mask: string }>('/ai/detect/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId, type }),
  })
}

// ─── AI PLANNER ───────────────────────────────────────────────────────────────────
// ─── Images ───────────────────────────────────────────────────────────────────
export async function uploadImage(
  projectId: string,
  file: File,
): Promise<ApiImage> {
  const form = new FormData()
  form.append('project', projectId)
  form.append('original_file', file)
  return api<ApiImage>('/images/', {
    method: 'POST',
    body: form,
  })
}

export async function getImage(id: string): Promise<ApiImage> {
  return api<ApiImage>(`/images/${id}/`)
}

// ─── Server-side processing ───────────────────────────────────────────────────
export async function processImageAdjustments(
  imageId: string,
  adjustments: Record<string, number>,
): Promise<ApiTask> {
  return api<ApiTask>(`/images/${imageId}/process/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adjustments }),
  })
}

export async function removeBackground(
  imageId: string,
): Promise<ApiTask> {
  return api<ApiTask>(`/images/${imageId}/remove_background/`, {
    method: 'POST',
  })
}


export async function getTaskStatus(imageId: string): Promise<ApiImage> {
  return api<ApiImage>(`/images/${imageId}/`)
}

// ─── Edit History ─────────────────────────────────────────────────────────────
export async function saveEditHistory(
  projectId: string,
  label: string,
  adjustments: Record<string, number>,
  hsl: Record<string, Record<string, number>>,
): Promise<ApiEditHistory> {
  return api<ApiEditHistory>('/edits/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ project: projectId, label, adjustments, hsl }),
  })
}

export async function listEditHistory(projectId: string): Promise<ApiEditHistory[]> {
  return api<ApiEditHistory[]>(`/edits/?project=${projectId}`)
}

// ─── AI Planner Proxy ────────────────────────────────────────────────────────
export async function callAIPlannerBackend(prompt: string): Promise<{ deltas: Record<string, unknown>; source: string }> {
  return api<{ deltas: Record<string, unknown>; source: string }>('/ai/plan/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
}

// ─── Clone Stamp ─────────────────────────────────────────────────────────────
export async function cloneStamp(
  imageId: string,
  srcX: number,
  srcY: number,
  strokes: [number, number, number][],
): Promise<ApiTask> {
  return api<ApiTask>(`/images/${imageId}/clone_stamp/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ src_x: srcX, src_y: srcY, strokes }),
  })
}

export interface ApiWorkflow {
  id: string
  name: string
  steps: Array<{ type: string;[key: string]: any }>
  created_at: string
}

// ─── Workflows ───────────────────────────────────────────────────────────────
export async function createWorkflow(name: string, steps: Array<any>): Promise<ApiWorkflow> {
  return api<ApiWorkflow>('/workflows/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, steps }),
  })
}

export async function listWorkflows(): Promise<ApiWorkflow[]> {
  return api<ApiWorkflow[]>('/workflows/')
}

export async function runWorkflow(workflowId: string, imageId: string): Promise<ApiTask> {
  return api<ApiTask>(`/workflows/${workflowId}/run/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image_id: imageId }),
  })
}

export async function deleteWorkflow(workflowId: string): Promise<void> {
  await api<void>(`/workflows/${workflowId}/`, { method: 'DELETE' })
}

// ─── Batch Processing ─────────────────────────────────────────────────────────

export interface ApiBatchJob {
  id: string
  name: string
  workflow: string | null
  adjustments: Record<string, number>
  image_ids: string[]
  status: 'pending' | 'running' | 'done' | 'failed'
  total: number
  processed: number
  failed_count: number
  results: Array<{ image_id: string; output_url: string | null; error: string | null }>
  created_at: string
  updated_at: string
}

/** Create a batch job record (does NOT start it yet). */
export async function createBatchJob(
  name: string,
  imageIds: string[],
  options?: { workflowId?: string; adjustments?: Record<string, number> },
): Promise<ApiBatchJob> {
  return api<ApiBatchJob>('/batch/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      image_ids: imageIds,
      workflow: options?.workflowId ?? null,
      adjustments: options?.adjustments ?? {},
    }),
  })
}

/** Start a previously created batch job. */
export async function startBatchJob(batchJobId: string): Promise<{ status: string; task_id: string }> {
  return api<{ status: string; task_id: string }>(`/batch/${batchJobId}/start/`, { method: 'POST' })
}

/** Poll a batch job for current progress. */
export async function getBatchJob(batchJobId: string): Promise<ApiBatchJob> {
  return api<ApiBatchJob>(`/batch/${batchJobId}/`)
}

/** List all batch jobs (most recent first). */
export async function listBatchJobs(): Promise<ApiBatchJob[]> {
  return api<ApiBatchJob[]>('/batch/')
}

/**
 * Upload multiple raw image files + immediately kick off a batch job.
 * @param files    Array of File objects selected by the user.
 * @param name     Display name for the batch job.
 * @param options  Optional workflowId or inline adjustments JSON string.
 */
export async function uploadAndStartBatch(
  files: File[],
  name: string,
  options?: { workflowId?: string; adjustments?: Record<string, number> },
): Promise<{ batch_job_id: string; task_id: string; image_ids: string[]; message: string }> {
  const form = new FormData()
  form.append('name', name)
  if (options?.workflowId) form.append('workflow_id', options.workflowId)
  if (options?.adjustments) form.append('adjustments', JSON.stringify(options.adjustments))
  for (const file of files) form.append('files', file)

  const url = `${BASE}/api/batch/upload_and_start/`
  const res = await fetch(url, { method: 'POST', headers: { Accept: 'application/json' }, body: form })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`[lumio-api] ${res.status} /batch/upload_and_start/: ${text}`)
  }
  return res.json()
}

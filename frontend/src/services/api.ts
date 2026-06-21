/**
 * Lumio API Service — Frontend client for the Django REST backend.
 * All requests go through this module to make mocking/swapping easy.
 */

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

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

export async function healImage(
  imageId: string,
  strokePoints: [number, number, number][],
): Promise<ApiTask> {
  return api<ApiTask>(`/images/${imageId}/heal/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stroke_points: strokePoints }),
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
export async function callAIPlannerBackend(prompt: string): Promise<Record<string, unknown>> {
  const result = await api<{ deltas: Record<string, unknown> }>('/ai/plan/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  })
  return result.deltas
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
  steps: Array<{ type: string; [key: string]: any }>
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

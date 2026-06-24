import React, { useRef, useState, useCallback, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Upload, Play, CheckCircle2, XCircle, Loader2,
  Download, Layers, ChevronDown, ChevronUp,
  Zap, ImageIcon, AlertTriangle, RefreshCw,
} from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import * as api from '../../services/api'
import type { ApiBatchJob } from '../../services/api'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8001'

type Mode = 'adjustments' | 'workflow'

function StatusBadge({ status }: { status: ApiBatchJob['status'] }) {
  const map: Record<ApiBatchJob['status'], { color: string; label: string; dot: string }> = {
    pending: { color: 'var(--amber)', label: 'Pending', dot: '#f59e0b' },
    running: { color: 'var(--a2)', label: 'Running', dot: 'var(--a)' },
    done:    { color: 'var(--green)', label: 'Done', dot: 'var(--green)' },
    failed:  { color: 'var(--red)', label: 'Failed', dot: 'var(--red)' },
  }
  const m = map[status]
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, fontWeight: 600, letterSpacing: '0.04em',
      padding: '2px 7px', borderRadius: 20,
      background: `${m.dot}18`,
      color: m.color,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: m.dot, display: 'inline-block' }} />
      {m.label}
    </span>
  )
}

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0
  return (
    <div style={{ height: 4, background: 'var(--b2)', borderRadius: 2, overflow: 'hidden' }}>
      <motion.div
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.4 }}
        style={{ height: '100%', background: 'linear-gradient(90deg, var(--a), var(--a2))', borderRadius: 2 }}
      />
    </div>
  )
}

function JobCard({ job, onRefresh }: { job: ApiBatchJob; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (job.status === 'running') {
      const id = setInterval(onRefresh, 1800)
      return () => clearInterval(id)
    }
  }, [job.status, onRefresh])

  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      style={{
        background: 'var(--s2)', border: '1px solid var(--b1)', borderRadius: 'var(--r2)',
        overflow: 'hidden', marginBottom: 6,
      }}
    >
      {/* Header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          padding: '9px 10px', cursor: 'pointer',
          display: 'flex', alignItems: 'center', gap: 8,
          transition: 'background var(--fast)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--s3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 600, color: 'var(--t1)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: 3,
          }}>
            {job.name}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StatusBadge status={job.status} />
            <span style={{ fontSize: 10, color: 'var(--t3)', fontVariantNumeric: 'tabular-nums' }}>
              {job.processed}/{job.total} images
            </span>
            {job.failed_count > 0 && (
              <span style={{ fontSize: 10, color: 'var(--red)' }}>
                {job.failed_count} failed
              </span>
            )}
          </div>
          {job.status === 'running' && (
            <div style={{ marginTop: 5 }}>
              <ProgressBar value={job.processed} max={job.total} />
            </div>
          )}
        </div>
        {job.status === 'running' && (
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
            <Loader2 size={13} color="var(--a2)" />
          </motion.div>
        )}
        {job.status === 'done' && <CheckCircle2 size={13} color="var(--green)" />}
        {job.status === 'failed' && <XCircle size={13} color="var(--red)" />}
        {expanded ? <ChevronUp size={12} color="var(--t3)" /> : <ChevronDown size={12} color="var(--t3)" />}
      </div>

      {/* Results list */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 4 }}>
              {job.results.length === 0 && job.status !== 'running' && (
                <div style={{ fontSize: 11, color: 'var(--t3)', padding: '6px 0' }}>No results yet.</div>
              )}
              {job.results.map((r, i) => (
                <div key={r.image_id + i} style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '5px 8px', borderRadius: 'var(--r)',
                  background: r.error ? 'rgba(239,68,68,0.06)' : 'var(--s3)',
                  border: `1px solid ${r.error ? 'rgba(239,68,68,0.2)' : 'var(--b2)'}`,
                }}>
                  {r.error
                    ? <XCircle size={11} color="var(--red)" style={{ flexShrink: 0 }} />
                    : <CheckCircle2 size={11} color="var(--green)" style={{ flexShrink: 0 }} />
                  }
                  <span 
                    onClick={() => { if (!r.error) useEditorStore.getState().setBatchPreview(r.image_id) }}
                    style={{ 
                      fontSize: 10, color: 'var(--t2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      cursor: r.error ? 'default' : 'pointer', textDecoration: r.error ? 'none' : 'underline', textUnderlineOffset: 2
                    }}
                    title={r.error ? r.error : "Click to view Before/After preview"}
                  >
                    {r.error ? r.error : `Image ${i + 1}`}
                  </span>
                  {r.output_url && (
                    <a
                      href={r.output_url.startsWith('http') ? r.output_url : `${BASE}${r.output_url}`}
                      download
                      style={{
                        display: 'flex', alignItems: 'center', gap: 3,
                        fontSize: 10, color: 'var(--a2)', textDecoration: 'none', flexShrink: 0,
                      }}
                    >
                      <Download size={10} /> DL
                    </a>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export function BatchPanel() {
  const [files, setFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)
  const [mode, setMode] = useState<Mode>('adjustments')
  const [jobName, setJobName] = useState('')
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [jobs, setJobs] = useState<ApiBatchJob[]>([])

  const fileInputRef = useRef<HTMLInputElement>(null)
  const workflows = useEditorStore(s => s.workflows)
  const adjustments = useEditorStore(s => s.adjustments)
  const showToast = useEditorStore(s => s.showToast)

  // Load workflow list on mount
  useEffect(() => {
    api.listWorkflows().then(wfs => {
      useEditorStore.getState().setWorkflows(wfs)
    }).catch(() => {})
  }, [])

  // Load past batch jobs
  useEffect(() => {
    api.listBatchJobs().then(setJobs).catch(() => {})
  }, [])

  const handleFiles = useCallback((newFiles: File[]) => {
    const images = newFiles.filter(f => f.type.startsWith('image/'))
    if (images.length === 0) return showToast('Please select image files', true)
    setFiles(prev => [...prev, ...images])
    if (!jobName) setJobName(`Batch — ${images.length} images`)
  }, [jobName, showToast])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    handleFiles(Array.from(e.dataTransfer.files))
  }, [handleFiles])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const removeFile = (idx: number) => {
    setFiles(prev => prev.filter((_, i) => i !== idx))
  }

  async function handleSubmit() {
    if (files.length === 0) return showToast('Add images first', true)
    const name = jobName.trim() || `Batch Job (${files.length} images)`

    setIsSubmitting(true)
    try {
      const opts: Parameters<typeof api.uploadAndStartBatch>[2] = {}
      if (mode === 'workflow' && selectedWorkflowId) {
        opts.workflowId = selectedWorkflowId
      } else {
        // Filter out zero-value adjustments to keep payload lean
        const nonDefault: Record<string, number> = {}
        for (const [k, v] of Object.entries(adjustments)) {
          if (v !== 0) nonDefault[k] = v as number
        }
        if (Object.keys(nonDefault).length > 0) opts.adjustments = nonDefault
      }

      const result = await api.uploadAndStartBatch(files, name, opts)
      showToast(`Batch started: ${files.length} images queued`)

      // Create a local job entry immediately for instant feedback
      const newJob: ApiBatchJob = {
        id: result.batch_job_id,
        name,
        workflow: opts.workflowId ?? null,
        adjustments: opts.adjustments ?? {},
        image_ids: result.image_ids,
        status: 'running',
        total: files.length,
        processed: 0,
        failed_count: 0,
        results: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      setJobs(prev => [newJob, ...prev])
      setFiles([])
      setJobName('')

    } catch (err: any) {
      showToast(err?.message ?? 'Batch submission failed', true)
    } finally {
      setIsSubmitting(false)
    }
  }

  const refreshJob = useCallback(async (jobId: string) => {
    try {
      const updated = await api.getBatchJob(jobId)
      setJobs(prev => prev.map(j => j.id === jobId ? updated : j))
    } catch {}
  }, [])

  function fmtSize(b: number) {
    if (b < 1024) return b + ' B'
    if (b < 1048576) return (b / 1024).toFixed(0) + ' KB'
    return (b / 1048576).toFixed(1) + ' MB'
  }

  const adjSummary = Object.entries(adjustments)
    .filter(([, v]) => (v as number) !== 0)
    .map(([k, v]) => `${k}: ${(v as number) > 0 ? '+' : ''}${v}`)
    .join(', ')

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 12, height: '100%', overflowY: 'auto' }}>

      {/* Drop zone */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 7 }}>
          Images ({files.length})
        </div>
        <div
          onDragOver={e => { e.preventDefault(); setIsDragging(true) }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          style={{
            border: `1.5px dashed ${isDragging ? 'var(--a)' : 'var(--b2)'}`,
            borderRadius: 'var(--r2)',
            background: isDragging ? 'var(--ag2)' : 'var(--s2)',
            padding: '14px 10px', textAlign: 'center', cursor: 'pointer',
            transition: 'all var(--fast)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <Upload size={20} color={isDragging ? 'var(--a)' : 'var(--t3)'} style={{ margin: '0 auto 6px' }} />
          <div style={{ fontSize: 12, color: 'var(--t2)', lineHeight: 1.5 }}>
            <strong style={{ color: 'var(--t1)', fontWeight: 500 }}>Drop images here</strong><br />
            or click to browse
          </div>
          <div style={{ fontSize: 10, color: 'var(--t3)', marginTop: 3 }}>JPG · PNG · WebP</div>
        </div>

        {/* File chips */}
        {files.length > 0 && (
          <div style={{ marginTop: 7, display: 'flex', flexDirection: 'column', gap: 3, maxHeight: 110, overflowY: 'auto' }}>
            {files.map((f, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--s3)', borderRadius: 'var(--r)',
                padding: '4px 8px', fontSize: 11,
              }}>
                <ImageIcon size={10} color="var(--t3)" style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--t1)' }}>
                  {f.name}
                </span>
                <span style={{ color: 'var(--t3)', fontSize: 10, flexShrink: 0 }}>{fmtSize(f.size)}</span>
                <button
                  onClick={e => { e.stopPropagation(); removeFile(i) }}
                  style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 13, lineHeight: 1, padding: '0 2px' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--red)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--t3)')}
                >×</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Job name */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
          Job Name
        </div>
        <input
          type="text"
          value={jobName}
          onChange={e => setJobName(e.target.value)}
          placeholder={`Batch — ${files.length} images`}
          style={{
            width: '100%', height: 30, background: 'var(--s2)',
            border: '1px solid var(--b1)', borderRadius: 'var(--r)',
            padding: '0 9px', fontSize: 12, color: 'var(--t1)',
            outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Mode toggle */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
          Apply
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          {(['adjustments', 'workflow'] as const).map(m => (
            <button
              key={m}
              onClick={() => setMode(m)}
              style={{
                flex: 1, height: 28, borderRadius: 'var(--r)',
                background: mode === m ? 'var(--a)' : 'var(--s2)',
                border: `1px solid ${mode === m ? 'transparent' : 'var(--b1)'}`,
                color: mode === m ? '#fff' : 'var(--t2)',
                fontSize: 11, fontWeight: 600, cursor: 'pointer',
                transition: 'all var(--fast)',
              }}
            >
              {m === 'adjustments' ? 'Current Edits' : 'Workflow'}
            </button>
          ))}
        </div>
      </div>

      {/* Mode-specific controls */}
      <AnimatePresence mode="wait">
        {mode === 'adjustments' && (
          <motion.div key="adj" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{
              padding: '9px 10px', background: 'var(--s2)',
              border: '1px solid var(--b1)', borderRadius: 'var(--r2)',
              fontSize: 11, lineHeight: 1.6,
            }}>
              {adjSummary ? (
                <>
                  <div style={{ fontSize: 10, color: 'var(--t3)', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Adjustments to apply
                  </div>
                  <div style={{ color: 'var(--t2)', wordBreak: 'break-word' }}>{adjSummary}</div>
                </>
              ) : (
                <div style={{ color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 7 }}>
                  <AlertTriangle size={12} style={{ flexShrink: 0 }} />
                  No adjustments set. Tweak sliders in the right panel first.
                </div>
              )}
            </div>
          </motion.div>
        )}
        {mode === 'workflow' && (
          <motion.div key="wf" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {workflows.length === 0 ? (
              <div style={{
                padding: '10px', background: 'var(--s2)', border: '1px solid var(--b1)',
                borderRadius: 'var(--r2)', fontSize: 11, color: 'var(--t3)',
                display: 'flex', alignItems: 'center', gap: 7,
              }}>
                <Layers size={12} />
                No workflows saved. Create one in the Workflows tab.
              </div>
            ) : (
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 6 }}>
                  Select Workflow
                </div>
                <select
                  value={selectedWorkflowId}
                  onChange={e => setSelectedWorkflowId(e.target.value)}
                  style={{
                    width: '100%', height: 30, background: 'var(--s2)',
                    border: '1px solid var(--b1)', borderRadius: 'var(--r)',
                    padding: '0 8px', fontSize: 12, color: 'var(--t1)',
                    outline: 'none', cursor: 'pointer', boxSizing: 'border-box',
                  }}
                >
                  <option value="">— choose a workflow —</option>
                  {workflows.map(wf => (
                    <option key={wf.id} value={wf.id}>{wf.name} ({wf.steps.length} steps)</option>
                  ))}
                </select>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Submit button */}
      <motion.button
        whileHover={{ filter: 'brightness(1.08)' }}
        whileTap={{ scale: 0.97 }}
        onClick={handleSubmit}
        disabled={isSubmitting || files.length === 0}
        style={{
          height: 36, width: '100%',
          background: files.length > 0 && !isSubmitting
            ? 'linear-gradient(125deg, var(--a), var(--rose))'
            : 'var(--s3)',
          border: 'none', borderRadius: 'var(--r2)',
          color: files.length > 0 && !isSubmitting ? '#fff' : 'var(--t3)',
          fontSize: 13, fontWeight: 600, cursor: files.length > 0 ? 'pointer' : 'not-allowed',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
          boxShadow: files.length > 0 && !isSubmitting ? '0 4px 18px rgba(124,111,255,.3)' : 'none',
          transition: 'all var(--fast)',
        }}
      >
        {isSubmitting ? (
          <>
            <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}>
              <Loader2 size={14} />
            </motion.div>
            Uploading…
          </>
        ) : (
          <>
            <Play size={14} />
            Start Batch ({files.length} {files.length === 1 ? 'image' : 'images'})
          </>
        )}
      </motion.button>

      {/* Active / past jobs */}
      {jobs.length > 0 && (
        <div>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            fontSize: 10, fontWeight: 600, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: 'var(--t3)', marginBottom: 7,
          }}>
            <span>Batch Queue ({jobs.length})</span>
            <button
              onClick={() => api.listBatchJobs().then(setJobs).catch(() => {})}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--t3)', display: 'flex', alignItems: 'center', gap: 3 }}
              title="Refresh all"
            >
              <RefreshCw size={10} /> Refresh
            </button>
          </div>
          {jobs.map(job => (
            <JobCard
              key={job.id}
              job={job}
              onRefresh={() => refreshJob(job.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

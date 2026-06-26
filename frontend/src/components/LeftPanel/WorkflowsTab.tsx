import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditorStore } from '../../store/editorStore'
import * as api from '../../services/api'
import {
  Play, Plus, Trash2, GripVertical, ChevronDown, ChevronRight,
  Eraser, Sliders, Maximize, Stamp, Check
} from 'lucide-react'

// ─── Step type definitions ────────────────────────────────────────────────────
type StepType = 'remove_background' | 'adjustment' | 'resize' | 'watermark'

interface AdjustmentStep {
  type: 'adjustment'
  adjustments: Record<string, number>
}
interface RemoveBgStep {
  type: 'remove_background'
}
interface ResizeStep {
  type: 'resize'
  max_width: number
  max_height: number
}
interface WatermarkStep {
  type: 'watermark'
  text: string
  opacity: number
  position: 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left' | 'center'
  font_scale: number
}

type WorkflowStep = AdjustmentStep | RemoveBgStep | ResizeStep | WatermarkStep

const STEP_META: Record<StepType, { label: string; desc: string; icon: React.ReactNode; color: string }> = {
  remove_background: {
    label: 'Remove Background',
    desc: 'AI-powered BG removal via BRIA RMBG-1.4',
    icon: <Eraser size={13} />,
    color: '#a855f7',
  },
  adjustment: {
    label: 'Adjustments',
    desc: 'Apply current editor slider values',
    icon: <Sliders size={13} />,
    color: '#3b82f6',
  },
  resize: {
    label: 'Resize',
    desc: 'Scale image to a max dimension (preserves aspect ratio)',
    icon: <Maximize size={13} />,
    color: '#f59e0b',
  },
  watermark: {
    label: 'Watermark',
    desc: 'Burn text onto image',
    icon: <Stamp size={13} />,
    color: '#10b981',
  },
}

function makeDefaultStep(type: StepType, adjustments: Record<string, number>): WorkflowStep {
  if (type === 'adjustment') return { type: 'adjustment', adjustments: { ...adjustments } }
  if (type === 'remove_background') return { type: 'remove_background' }
  if (type === 'resize') return { type: 'resize', max_width: 1920, max_height: 1080 }
  return { type: 'watermark', text: '© Lumio', opacity: 0.5, position: 'bottom_right', font_scale: 1.0 }
}

// ─── Single Step Card ─────────────────────────────────────────────────────────
function StepCard({
  step,
  onRemove,
  onChange,
}: {
  step: WorkflowStep
  onRemove: () => void
  onChange: (updated: WorkflowStep) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const meta = STEP_META[step.type]

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, height: 0 }}
      style={{
        background: 'var(--s2)',
        border: `1px solid var(--b1)`,
        borderLeft: `2.5px solid ${meta.color}`,
        borderRadius: 'var(--r)',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px' }}>
        <GripVertical size={12} color="var(--t3)" style={{ cursor: 'grab', flexShrink: 0 }} />
        <div style={{
          width: 22, height: 22, borderRadius: 5,
          background: meta.color + '22',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: meta.color, flexShrink: 0,
        }}>
          {meta.icon}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t1)' }}>{meta.label}</div>
          <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{meta.desc}</div>
        </div>
        {step.type !== 'remove_background' && (
          <button
            onClick={() => setExpanded(e => !e)}
            style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', padding: 2 }}
            title="Configure step"
          >
            {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
          </button>
        )}
        <button
          onClick={onRemove}
          style={{ background: 'none', border: 'none', color: 'var(--red)', cursor: 'pointer', padding: 2, flexShrink: 0 }}
          title="Remove step"
        >
          <Trash2 size={12} />
        </button>
      </div>

      {/* Config panel */}
      <AnimatePresence>
        {expanded && step.type !== 'remove_background' && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '6px 10px 10px', borderTop: '1px solid var(--b1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              {step.type === 'resize' && (
                <>
                  <label style={labelStyle}>Max Width (px)</label>
                  <input type="number" value={(step as ResizeStep).max_width} min={0}
                    onChange={e => onChange({ ...step, max_width: +e.target.value } as ResizeStep)}
                    style={inputStyle}
                  />
                  <label style={labelStyle}>Max Height (px)</label>
                  <input type="number" value={(step as ResizeStep).max_height} min={0}
                    onChange={e => onChange({ ...step, max_height: +e.target.value } as ResizeStep)}
                    style={inputStyle}
                  />
                  <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 2 }}>
                    Set to 0 to ignore that dimension. Aspect ratio is always preserved.
                  </div>
                </>
              )}
              {step.type === 'watermark' && (
                <>
                  <label style={labelStyle}>Text</label>
                  <input type="text" value={(step as WatermarkStep).text}
                    onChange={e => onChange({ ...step, text: e.target.value } as WatermarkStep)}
                    style={inputStyle} placeholder="e.g. © My Brand"
                  />
                  <label style={labelStyle}>Position</label>
                  <select value={(step as WatermarkStep).position}
                    onChange={e => onChange({ ...step, position: e.target.value as WatermarkStep['position'] } as WatermarkStep)}
                    style={{ ...inputStyle, cursor: 'pointer' }}
                  >
                    <option value="bottom_right">Bottom Right</option>
                    <option value="bottom_left">Bottom Left</option>
                    <option value="top_right">Top Right</option>
                    <option value="top_left">Top Left</option>
                    <option value="center">Center</option>
                  </select>
                  <label style={labelStyle}>Opacity: {Math.round((step as WatermarkStep).opacity * 100)}%</label>
                  <input type="range" min={0.1} max={1} step={0.05} value={(step as WatermarkStep).opacity}
                    onChange={e => onChange({ ...step, opacity: +e.target.value } as WatermarkStep)}
                    style={{ width: '100%' }}
                  />
                  <label style={labelStyle}>Font Scale: {(step as WatermarkStep).font_scale.toFixed(1)}x</label>
                  <input type="range" min={0.5} max={4} step={0.1} value={(step as WatermarkStep).font_scale}
                    onChange={e => onChange({ ...step, font_scale: +e.target.value } as WatermarkStep)}
                    style={{ width: '100%' }}
                  />
                </>
              )}
              {step.type === 'adjustment' && (
                <div style={{ fontSize: 10, color: 'var(--t3)' }}>
                  {Object.entries((step as AdjustmentStep).adjustments)
                    .filter(([, v]) => v !== 0)
                    .map(([k, v]) => `${k}: ${v > 0 ? '+' : ''}${v}`)
                    .join(' · ') || 'No adjustments currently active.'}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 10, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }
const inputStyle: React.CSSProperties = {
  height: 28, background: 'var(--s1)', border: '1px solid var(--b2)',
  borderRadius: 'var(--r)', padding: '0 8px', fontSize: 11.5,
  color: 'var(--t1)', outline: 'none', width: '100%',
}

// ─── Main WorkflowsTab ────────────────────────────────────────────────────────
export function WorkflowsTab() {
  const imageEl = useEditorStore(s => s.imageEl)
  const backendImageId = useEditorStore(s => s.backendImageId)
  const adjustments = useEditorStore(s => s.adjustments)
  const workflows = useEditorStore(s => s.workflows)
  const setWorkflows = useEditorStore(s => s.setWorkflows)
  const showToast = useEditorStore(s => s.showToast)
  const swapImage = useEditorStore(s => s.swapImage)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const setProcessing = useEditorStore(s => s.setProcessing)
  const imageName = useEditorStore(s => s.imageName)
  const imageSize = useEditorStore(s => s.imageSize)

  const [wfName, setWfName] = useState('')
  const [steps, setSteps] = useState<WorkflowStep[]>([])
  const [isRunning, setIsRunning] = useState<string | null>(null)
  const [showBuilder, setShowBuilder] = useState(false)

  useEffect(() => {
    api.listWorkflows()
      .then(wfs => setWorkflows(wfs))
      .catch(() => showToast('Failed to fetch workflows', true))
  }, [setWorkflows, showToast])

  function addStep(type: StepType) {
    setSteps(prev => [...prev, makeDefaultStep(type, adjustments as unknown as Record<string, number>)])
  }

  function removeStep(index: number) {
    setSteps(prev => prev.filter((_, i) => i !== index))
  }

  function updateStep(index: number, updated: WorkflowStep) {
    setSteps(prev => prev.map((s, i) => i === index ? updated : s))
  }

  async function handleSaveWorkflow() {
    const name = wfName.trim()
    if (!name || steps.length === 0) return
    try {
      const newWf = await api.createWorkflow(name, steps)
      setWorkflows([...workflows, newWf])
      setWfName('')
      setSteps([])
      setShowBuilder(false)
      showToast(`Workflow "${name}" saved!`)
    } catch {
      showToast('Failed to save workflow', true)
    }
  }

  async function handleRunWorkflow(workflowId: string, workflowName: string) {
    if (!imageEl || !backendImageId) {
      showToast('Upload an image first!', true)
      return
    }
    setIsRunning(workflowId)
    setProcessing(true, 'Running Workflow...', `Applying: ${workflowName}`)
    try {
      await api.runWorkflow(workflowId, backendImageId)
      const deadline = Date.now() + 90000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1800))
        const status = await api.getTaskStatus(backendImageId)
        if (status.processed_file) {
          const backendRoot = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
          const url = status.processed_file.startsWith('http')
            ? status.processed_file
            : `${backendRoot}${status.processed_file}`
          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            swapImage(img, imageName || 'processed.png', imageSize || 0)
            pushHistory(`Workflow: ${workflowName}`)
            showToast(`Workflow "${workflowName}" applied!`)
            setProcessing(false)
            setIsRunning(null)
          }
          img.src = url
          return
        }
      }
      throw new Error('timed out')
    } catch {
      showToast('Workflow run failed', true)
      setProcessing(false)
      setIsRunning(null)
    }
  }

  async function handleDeleteWorkflow(id: string, name: string) {
    try {
      await api.deleteWorkflow(id)
      setWorkflows(workflows.filter(w => w.id !== id))
      showToast(`Deleted "${name}"`)
    } catch {
      showToast('Delete failed', true)
    }
  }

  return (
    <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Header / New Workflow button */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--t3)' }}>
          Workflows ({workflows.length})
        </span>
        <button
          onClick={() => setShowBuilder(v => !v)}
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            background: showBuilder ? 'var(--s3)' : 'var(--a)',
            color: '#fff', border: 'none', borderRadius: 'var(--r)',
            padding: '4px 9px', fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
          }}
        >
          {showBuilder ? <Check size={11} /> : <Plus size={11} />}
          {showBuilder ? 'Close' : 'New'}
        </button>
      </div>

      {/* ─── Builder ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showBuilder && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              background: 'var(--s2)', border: '1px solid var(--b1)',
              borderRadius: 'var(--r2)', padding: 10, display: 'flex', flexDirection: 'column', gap: 10,
            }}>
              {/* Name input */}
              <input
                type="text"
                placeholder="Workflow name..."
                value={wfName}
                onChange={e => setWfName(e.target.value)}
                style={{
                  ...inputStyle,
                  background: 'var(--s1)', height: 30,
                  fontSize: 12, fontWeight: 500,
                }}
              />

              {/* Add step buttons */}
              <div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
                  Add Step
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {(Object.keys(STEP_META) as StepType[]).map(type => {
                    const meta = STEP_META[type]
                    return (
                      <button
                        key={type}
                        onClick={() => addStep(type)}
                        title={meta.desc}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          background: meta.color + '18',
                          border: `1px solid ${meta.color}44`,
                          color: meta.color,
                          borderRadius: 'var(--r)', padding: '4px 8px',
                          fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
                        }}
                      >
                        {meta.icon}{meta.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Step list */}
              {steps.length > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ fontSize: 9.5, color: 'var(--t3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Steps ({steps.length})
                  </div>
                  <AnimatePresence mode="popLayout">
                    {steps.map((step, i) => (
                      <StepCard
                        key={`${step.type}-${i}`}
                        step={step}
                        onRemove={() => removeStep(i)}
                        onChange={updated => updateStep(i, updated)}
                      />
                    ))}
                  </AnimatePresence>
                </div>
              )}

              {steps.length === 0 && (
                <div style={{ textAlign: 'center', padding: '10px 0', color: 'var(--t3)', fontSize: 11 }}>
                  No steps yet — add some above
                </div>
              )}

              {/* Save button */}
              <button
                onClick={handleSaveWorkflow}
                disabled={!wfName.trim() || steps.length === 0}
                style={{
                  height: 32, background: (wfName.trim() && steps.length > 0) ? 'var(--a)' : 'var(--s3)',
                  color: (wfName.trim() && steps.length > 0) ? '#fff' : 'var(--t3)',
                  border: 'none', borderRadius: 'var(--r)', fontSize: 12, fontWeight: 600,
                  cursor: (wfName.trim() && steps.length > 0) ? 'pointer' : 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                  transition: 'all 0.15s',
                }}
              >
                <Check size={13} /> Save Workflow
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ─── Saved Workflow List ──────────────────────────────────── */}
      {workflows.length === 0 && !showBuilder ? (
        <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--t3)', fontSize: 11, lineHeight: 1.6 }}>
          No workflows yet.<br />Click <strong>New</strong> above to build your first automation.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {workflows.map(wf => (
            <motion.div
              key={wf.id}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                background: 'var(--s2)', border: '1px solid var(--b1)',
                borderRadius: 'var(--r)', padding: '9px 10px',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {wf.name}
                </div>
                <div style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 2, display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  {wf.steps.map((s: any, i: number) => (
                    <span
                      key={i}
                      style={{
                        background: (STEP_META[s.type as StepType]?.color ?? '#888') + '22',
                        color: STEP_META[s.type as StepType]?.color ?? '#888',
                        border: `1px solid ${(STEP_META[s.type as StepType]?.color ?? '#888')}44`,
                        borderRadius: 3, padding: '1px 5px', fontSize: 9,
                      }}
                    >
                      {STEP_META[s.type as StepType]?.label ?? s.type}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 5, flexShrink: 0 }}>
                <button
                  onClick={() => handleRunWorkflow(wf.id, wf.name)}
                  disabled={isRunning !== null || !backendImageId}
                  title={!backendImageId ? 'Upload image first' : 'Run workflow'}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 3,
                    background: isRunning === wf.id ? 'var(--s4)' : 'var(--a)',
                    color: '#fff', border: 'none', borderRadius: 4,
                    padding: '4px 8px', fontSize: 10.5, fontWeight: 600,
                    cursor: (!backendImageId || isRunning !== null) ? 'not-allowed' : 'pointer',
                    opacity: !backendImageId ? 0.4 : 1,
                    transition: 'opacity 0.15s',
                  }}
                >
                  <Play size={10} fill="currentColor" />
                  {isRunning === wf.id ? '...' : 'Run'}
                </button>
                <button
                  onClick={() => handleDeleteWorkflow(wf.id, wf.name)}
                  title="Delete workflow"
                  style={{
                    background: 'none', border: '1px solid var(--b2)',
                    color: 'var(--red)', borderRadius: 4, padding: '4px 6px',
                    cursor: 'pointer', display: 'flex', alignItems: 'center',
                  }}
                >
                  <Trash2 size={10} />
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

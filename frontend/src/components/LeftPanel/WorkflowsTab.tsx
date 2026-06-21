import { useEffect, useState } from 'react'
import { useEditorStore } from '../../store/editorStore'
import * as api from '../../services/api'
import { Play, Plus } from 'lucide-react'

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

  const [wfName, setWfName] = useState('')
  const [isRunning, setIsRunning] = useState<string | null>(null)

  // Fetch workflows on mount
  useEffect(() => {
    api.listWorkflows()
      .then(wfs => setWorkflows(wfs))
      .catch(() => showToast('Failed to fetch workflows', true))
  }, [setWorkflows, showToast])

  // Save current adjustments as a workflow
  async function handleSaveWorkflow() {
    const name = wfName.trim()
    if (!name) return
    
    // Build steps from adjustments
    const steps = [
      {
        type: 'adjustment',
        adjustments: { ...adjustments }
      }
    ]

    try {
      const newWf = await api.createWorkflow(name, steps)
      setWorkflows([...workflows, newWf])
      setWfName('')
      showToast(`Workflow "${name}" created!`)
    } catch (err) {
      showToast('Failed to save workflow', true)
    }
  }

  // Run a workflow on the current active image
  async function handleRunWorkflow(workflowId: string, workflowName: string) {
    if (!imageEl || !backendImageId) {
      showToast('Upload/sync image first!', true)
      return
    }

    setIsRunning(workflowId)
    setProcessing(true, 'Running Workflow...', `Applying: ${workflowName}`)

    try {
      await api.runWorkflow(workflowId, backendImageId)
      // Poll task status
      const deadline = Date.now() + 60000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500))
        const status = await api.getTaskStatus(backendImageId)
        if (status.processed_file) {
          const backendRoot = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
          const url = status.processed_file.startsWith('http')
            ? status.processed_file
            : `${backendRoot}${status.processed_file}`

          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            swapImage(img, status.original_file || 'processed.png', status.size_bytes || 0)
            pushHistory(`Run Workflow: ${workflowName}`)
            showToast(`Workflow applied successfully!`)
            setProcessing(false)
            setIsRunning(null)
          }
          img.src = url
          return
        }
      }
      throw new Error('Workflow run timed out')
    } catch (err) {
      showToast('Workflow run failed', true)
      setProcessing(false)
      setIsRunning(null)
    }
  }

  return (
    <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Create Section */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--s2)', padding: 10, borderRadius: 'var(--r2)', border: '1px solid var(--b1)' }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          Save current edits
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Workflow name..."
            value={wfName}
            onChange={(e) => setWfName(e.target.value)}
            style={{
              flex: 1, height: 28, background: 'var(--s1)',
              border: '1px solid var(--b2)', borderRadius: 'var(--r)',
              padding: '0 8px', fontSize: 11.5, color: 'var(--t1)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSaveWorkflow}
            disabled={!wfName.trim()}
            style={{
              height: 28, padding: '0 10px',
              background: wfName.trim() ? 'var(--a)' : 'var(--s3)',
              color: wfName.trim() ? '#fff' : 'var(--t3)',
              border: 'none', borderRadius: 'var(--r)',
              fontSize: 11, fontWeight: 600, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
              transition: 'all var(--fast)',
            }}
          >
            <Plus size={12} /> Save
          </button>
        </div>
      </div>

      {/* Workflows List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--t3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginBottom: 2 }}>
          Saved Workflows ({workflows.length})
        </span>

        {workflows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '24px 12px', color: 'var(--t3)', fontSize: 11 }}>
            No saved workflows yet. Customize edits and click Save above.
          </div>
        ) : (
          workflows.map(wf => (
            <div
              key={wf.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--s2)',
                border: '1px solid var(--b1)',
                borderRadius: 'var(--r)',
                padding: '8px 10px',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1, marginRight: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {wf.name}
                </span>
                <span style={{ fontSize: 9.5, color: 'var(--t3)', marginTop: 2 }}>
                  {wf.steps.length} step(s)
                </span>
              </div>

              <button
                onClick={() => handleRunWorkflow(wf.id, wf.name)}
                disabled={isRunning !== null || !backendImageId}
                style={{
                  background: isRunning === wf.id ? 'var(--s3)' : 'var(--a)',
                  color: '#fff', border: 'none', borderRadius: 4,
                  padding: '4px 8px', fontSize: 10.5, fontWeight: 600,
                  cursor: (isRunning !== null || !backendImageId) ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', gap: 4,
                  opacity: (!backendImageId) ? 0.4 : 1,
                  transition: 'opacity var(--fast)',
                }}
                title={!backendImageId ? "Upload and sync image first" : "Run workflow"}
              >
                <Play size={10} fill="currentColor" /> Run
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  )
}

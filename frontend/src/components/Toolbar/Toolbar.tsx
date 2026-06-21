import React from 'react'
import { motion } from 'framer-motion'
import { useEditorStore } from '../../store/editorStore'
import type { Tool } from '../../store/editorStore'
import {
  MousePointer2, Crop, Sparkles, Pipette,
  Undo2, Redo2, RotateCcw, Download, Stamp, Type
} from 'lucide-react'

const TOOLS: { id: Tool; label: string; icon: React.ReactNode; key: string }[] = [
  { id: 'select', label: 'Select', icon: <MousePointer2 size={13} strokeWidth={1.8} />, key: 'V' },
  { id: 'crop',   label: 'Crop',   icon: <Crop size={13} strokeWidth={1.8} />,          key: 'C' },
  { id: 'heal',   label: 'Heal',   icon: <Sparkles size={13} strokeWidth={1.8} />,      key: 'H' },
  { id: 'stamp',  label: 'Stamp',  icon: <Stamp size={13} strokeWidth={1.8} />,         key: 'S' },
  { id: 'text',   label: 'Text',   icon: <Type size={13} strokeWidth={1.8} />,           key: 'T' },
  { id: 'pick',   label: 'Pick',   icon: <Pipette size={13} strokeWidth={1.8} />,       key: 'I' },
]

export function Toolbar() {
  const activeTool = useEditorStore(s => s.activeTool)
  const setActiveTool = useEditorStore(s => s.setActiveTool)
  const undo = useEditorStore(s => s.undo)
  const redo = useEditorStore(s => s.redo)
  const resetAllAdjustments = useEditorStore(s => s.resetAllAdjustments)
  const imageEl = useEditorStore(s => s.imageEl)
  const showToast = useEditorStore(s => s.showToast)
  const pushHistory = useEditorStore(s => s.pushHistory)

  function handleReset() {
    if (!imageEl) return
    resetAllAdjustments()
    pushHistory('Reset to original')
    showToast('Reset to original')
  }

  function handleExport() {
    const section = document.getElementById('sec-export')
    section?.scrollIntoView({ behavior: 'smooth' })
  }

  return (
    <header
      id="toolbar"
      style={{
        height: 'var(--tb)',
        background: 'var(--s1)',
        borderBottom: '1px solid var(--b1)',
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        gap: '3px',
        flexShrink: 0,
        zIndex: 100,
      }}
    >
      {/* Logo */}
      <div style={{ fontFamily: 'var(--display)', fontSize: 19, fontWeight: 700, letterSpacing: '-0.7px', color: 'var(--t1)', marginRight: 12, userSelect: 'none', flexShrink: 0 }}>
        Lumi<span style={{ color: 'var(--a2)' }}>o</span>
        <span style={{ fontFamily: 'var(--body)', fontSize: 9.5, fontWeight: 500, color: 'var(--t3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginLeft: 2, verticalAlign: 'middle' }}>
          beta
        </span>
      </div>

      <div style={{ width: 1, height: 20, background: 'var(--b2)', margin: '0 8px', flexShrink: 0 }} />

      {/* Tool buttons */}
      {TOOLS.map(tool => (
        <ToolBtn
          key={tool.id}
          active={activeTool === tool.id}
          onClick={() => setActiveTool(tool.id)}
          title={`${tool.label} (${tool.key})`}
        >
          {tool.icon}{tool.label}
        </ToolBtn>
      ))}

      <div style={{ width: 1, height: 20, background: 'var(--b2)', margin: '0 8px', flexShrink: 0 }} />

      <ToolBtn onClick={undo} title="Undo (Ctrl+Z)">
        <Undo2 size={14} strokeWidth={1.8} />Undo
      </ToolBtn>
      <ToolBtn onClick={redo} title="Redo (Ctrl+Shift+Z)">
        <Redo2 size={14} strokeWidth={1.8} />Redo
      </ToolBtn>

      {/* Right side */}
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {/* AI pill */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          background: 'linear-gradient(125deg, var(--a), var(--rose))',
          borderRadius: 20, padding: '3px 11px',
          fontSize: 10.5, fontWeight: 600, color: '#fff', letterSpacing: '0.04em',
          flexShrink: 0,
        }}>
          <div className="animate-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'rgba(255,255,255,0.7)' }} />
          Lumio AI
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--b2)', flexShrink: 0 }} />

        <ToolBtn onClick={handleReset} danger title="Reset all edits">
          <RotateCcw size={14} strokeWidth={1.8} />Reset
        </ToolBtn>

        <motion.button
          whileHover={{ filter: 'brightness(1.1)' }}
          whileTap={{ scale: 0.96 }}
          onClick={handleExport}
          style={{
            height: 30, padding: '0 14px',
            background: 'var(--a)', color: '#fff', border: 'none',
            borderRadius: 'var(--r)', fontSize: 12.5, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
            flexShrink: 0,
          }}
        >
          <Download size={13} strokeWidth={2} />Export
        </motion.button>
      </div>
    </header>
  )
}

// ─── Reusable toolbar button ──────────────────────────────────────────────────
function ToolBtn({
  children,
  active = false,
  danger = false,
  onClick,
  title,
}: {
  children: React.ReactNode
  active?: boolean
  danger?: boolean
  onClick?: () => void
  title?: string
}) {
  return (
    <motion.button
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      title={title}
      style={{
        height: 30, padding: '0 10px',
        borderRadius: 'var(--r)',
        border: `1px solid ${active ? 'var(--b2)' : 'transparent'}`,
        background: active ? 'var(--s3)' : 'transparent',
        color: active ? 'var(--t1)' : 'var(--t2)',
        fontSize: 12.5, fontWeight: 500, cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 5,
        whiteSpace: 'nowrap', flexShrink: 0,
        transition: 'color var(--fast), background var(--fast), border-color var(--fast)',
      }}
      onMouseEnter={e => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'var(--s3)'
          ;(e.currentTarget as HTMLButtonElement).style.color = danger ? 'var(--red)' : 'var(--t1)'
        }
      }}
      onMouseLeave={e => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.background = 'transparent'
          ;(e.currentTarget as HTMLButtonElement).style.color = 'var(--t2)'
        }
      }}
    >
      {children}
    </motion.button>
  )
}

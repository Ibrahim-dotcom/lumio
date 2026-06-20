import React, { useState, useRef, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useEditorStore } from '../../store/editorStore'
import type { Adjustments } from '../../store/editorStore'
import { callAIPlanner } from '../../services/aiPlanner'
import { CHIPS } from '../../data/presets'
import { Sparkles, Send } from 'lucide-react'
import { useBackgroundRemoval } from '../../hooks/useBackgroundRemoval'

export function PromptBar() {
  const [input, setInput] = useState('')
  const [appliedChips, setAppliedChips] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const imageEl = useEditorStore(s => s.imageEl)
  const setProcessing = useEditorStore(s => s.setProcessing)
  const applyAdjustmentDelta = useEditorStore(s => s.applyAdjustmentDelta)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const showToast = useEditorStore(s => s.showToast)

  const { remove: removeBg, isWorking: isRemoving, progress: bgProgress } = useBackgroundRemoval()

  const hasInput = input.trim().length > 0

  async function sendPrompt() {
    const txt = input.trim()
    if (!txt) return
    if (!imageEl) return showToast('Upload a photo first', true)

    setInput('')

    setProcessing(true, 'Claude is reading your prompt…', 'Sending to AI · claude-sonnet-4-6', 0)
    const result = await callAIPlanner(txt)
    setProcessing(true, 'Mapping to adjustments…', 'Building pixel operation list', 1)
    await sleep(160)
    setProcessing(true, 'Rendering on canvas…', 'Processing pixels', 2)
    await sleep(120)
    setProcessing(false)

    if ('_unsupported' in result && result._unsupported) {
      return showToast('Can\'t map that yet — try: "warmer", "cinematic", "lift shadows"', true)
    }

    const deltas = result as Partial<Adjustments>
    applyAdjustmentDelta(deltas)
    pushHistory(txt)

    const applied = Object.keys(deltas)
    showToast(applied.length
      ? `Applied: ${applied.slice(0, 4).join(', ')}${applied.length > 4 ? '…' : ''}`
      : 'No adjustments made'
    )

    // Mark chips
    const lo = txt.toLowerCase()
    setAppliedChips(prev => {
      const next = new Set(prev)
      CHIPS.forEach(c => {
        const key = c.label.replace(/[^\w]/g, '').toLowerCase().slice(0, 5)
        if (lo.includes(key)) next.add(c.label)
      })
      return next
    })
  }

  function useChip(chip: typeof CHIPS[0]) {
    setInput(chip.prompt)
    inputRef.current?.focus()
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendPrompt()
    }
  }

  // Global keyboard shortcut handler
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'z') {
        e.preventDefault()
        useEditorStore.getState().undo()
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === 'z') {
        e.preventDefault()
        useEditorStore.getState().redo()
      }
      if (e.key === '+' || e.key === '=') useEditorStore.getState().deltaZoom(0.15)
      if (e.key === '-') useEditorStore.getState().deltaZoom(-0.15)
      if (e.key === '0') useEditorStore.getState().setZoom(1)
      if (e.key === 'v' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('select')
      if (e.key === 'c' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('crop')
      if (e.key === 'h' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('heal')
      if (e.key === 'i' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('pick')
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  // Auto-dismiss toast
  useEffect(() => {
    const store = useEditorStore.getState()
    if (!store.toast) return
    const t = setTimeout(() => useEditorStore.setState({ toast: null }), 3500)
    return () => clearTimeout(t)
  })

  return (
    <div style={{
      background: 'var(--s1)', borderTop: '1px solid var(--b1)',
      padding: '13px 14px 11px', flexShrink: 0,
    }}>
      {/* Chips */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginBottom: 10 }}>
        {CHIPS.map(chip => {
          const isApplied = appliedChips.has(chip.label)
          return (
            <motion.button
              key={chip.label}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => useChip(chip)}
              className="chip-btn"
              style={{
                padding: '4px 11px', borderRadius: 20,
                border: `1px solid ${isApplied ? 'var(--green)' : 'var(--b2)'}`,
                background: isApplied ? 'var(--gg)' : 'transparent',
                color: isApplied ? 'var(--green)' : 'var(--t2)',
                fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap',
              }}
            >
              {chip.label}
            </motion.button>
          )
        })}
      </div>

      {/* Input row */}
      <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
        {/* Glowing box */}
        <div className="pbox-glow" style={{ flex: 1, position: 'relative', borderRadius: 'var(--r2)' }}>
          <div style={{
            position: 'relative', zIndex: 1,
            background: 'var(--s2)',
            border: `1px solid var(--b2)`,
            borderRadius: 'var(--r2)',
            display: 'flex', alignItems: 'center', gap: 9, padding: '11px 14px',
          }}>
            <Sparkles size={16} strokeWidth={1.8} color="var(--t3)" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              id="pinput"
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              autoComplete="off"
              spellCheck={false}
              placeholder="Describe your edit… e.g. cinematic teal and orange, lift the shadows, make it dreamy"
              style={{
                flex: 1, background: 'none', border: 'none', outline: 'none',
                font: `14px var(--body)`, color: 'var(--t1)', caretColor: 'var(--a2)',
              }}
            />
            {input.length > 0 && (
              <span style={{ fontSize: 10, color: 'var(--t3)', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                {input.length}
              </span>
            )}
          </div>
        </div>

        {/* Background Removal Button */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={removeBg}
          disabled={isRemoving || !imageEl}
          title="Remove Background (rembg)"
          style={{
            height: 42, padding: '0 12px', flexShrink: 0,
            background: isRemoving
              ? 'var(--s3)'
              : imageEl
                ? 'rgba(124, 111, 255, 0.15)'
                : 'var(--s3)',
            border: `1px solid ${imageEl ? 'rgba(124, 111, 255, 0.3)' : 'var(--b2)'}`,
            borderRadius: 'var(--r)',
            color: imageEl ? 'var(--a2)' : 'var(--t3)',
            cursor: imageEl ? 'pointer' : 'not-allowed',
            display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 500,
            transition: 'all var(--fast)',
          }}
        >
          {isRemoving ? (
            <>
              <div style={{
                width: 13, height: 13, border: '1.5px solid var(--b3)', borderTopColor: 'var(--a)',
                borderRadius: '50%', animation: 'spin 0.8s linear infinite'
              }} />
              <span>Removing... {bgProgress}%</span>
            </>
          ) : (
            <>
              <Sparkles size={14} />
              <span>Cutout BG</span>
            </>
          )}
        </motion.button>

        {/* Send button */}
        <motion.button
          whileTap={{ scale: 0.93 }}
          onClick={sendPrompt}
          title="Apply (Enter)"
          style={{
            width: 42, height: 42, flexShrink: 0,
            background: hasInput
              ? 'linear-gradient(130deg, var(--a), var(--rose))'
              : 'var(--s3)',
            border: `1px solid ${hasInput ? 'transparent' : 'var(--b2)'}`,
            borderRadius: 'var(--r)',
            color: hasInput ? '#fff' : 'var(--t3)',
            cursor: hasInput ? 'pointer' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: hasInput ? '0 4px 18px rgba(124,111,255,.36)' : 'none',
            transition: 'all var(--fast)',
          }}
        >
          <Send size={18} strokeWidth={2} />
        </motion.button>
      </div>

      {/* Hint row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
        {[
          { key: 'Enter', desc: 'apply' },
          { key: 'Space', desc: 'compare original' },
          { key: 'Ctrl+Z', desc: 'undo' },
          { key: 'Ctrl+⇧Z', desc: 'redo' },
        ].map((h, i, arr) => (
          <React.Fragment key={h.key}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'var(--t3)' }}>
              <span style={{ background: 'var(--s4)', border: '1px solid var(--b2)', borderRadius: 4, padding: '1px 5px', fontSize: 10, color: 'var(--t2)' }}>
                {h.key}
              </span>
              {h.desc}
            </div>
            {i < arr.length - 1 && <span style={{ color: 'var(--b2)', fontSize: 12 }}>·</span>}
          </React.Fragment>
        ))}
        <span style={{ color: 'var(--b2)', fontSize: 12 }}>·</span>
        <div style={{ fontSize: 11, color: 'var(--t3)' }}>Non-destructive</div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'var(--ag)', border: '1px solid rgba(124,111,255,.22)', borderRadius: 20, fontSize: 11, color: 'var(--a2)' }}>
          <div className="animate-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--a)' }} />
          Claude ready
        </div>
      </div>
    </div>
  )
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

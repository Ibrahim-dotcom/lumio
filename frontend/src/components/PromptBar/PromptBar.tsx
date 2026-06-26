import React, { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditorStore } from '../../store/editorStore'
import type { Adjustments } from '../../store/editorStore'
import { callAIPlanner, detectAction } from '../../services/aiPlanner'
import { CHIPS } from '../../data/presets'
import { Sparkles, Send, ChevronUp, ChevronDown, Trash2, ArrowLeftRight, Check, Undo2 } from 'lucide-react'
import { useBackgroundRemoval } from '../../hooks/useBackgroundRemoval'
import { detectMask } from '../../services/api'

export function PromptBar() {
  const [input, setInput] = useState('')
  const [isExpanded, setIsExpanded] = useState(false)
  const [aiIsTyping, setAiIsTyping] = useState(false)
  const [appliedChips, setAppliedChips] = useState<Set<string>>(new Set())

  const chatEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const imageEl = useEditorStore(s => s.imageEl)
  const backendImageId = useEditorStore(s => s.backendImageId)
  const chatMessages = useEditorStore(s => s.chatMessages)
  const addChatMessage = useEditorStore(s => s.addChatMessage)
  const clearChat = useEditorStore(s => s.clearChat)
  const applyAdjustmentDelta = useEditorStore(s => s.applyAdjustmentDelta)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const showToast = useEditorStore(s => s.showToast)
  const undo = useEditorStore(s => s.undo)
  const redo = useEditorStore(s => s.redo)
  const resetAllAdjustments = useEditorStore(s => s.resetAllAdjustments)
  const addAdjustmentLayer = useEditorStore(s => s.addAdjustmentLayer)

  const { remove: removeBg, status: bgStatus, progress: bgProgress, isWorking: isRemoving } = useBackgroundRemoval()

  const hasInput = input.trim().length > 0

  // Scroll to bottom on message change or typing state change
  useEffect(() => {
    if (isExpanded) {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [chatMessages, aiIsTyping, isExpanded])

  // Monitor background removal progress and inject progress messages to chat
  const lastProgressRef = useRef(0)
  useEffect(() => {
    if (isRemoving && bgProgress !== lastProgressRef.current) {
      lastProgressRef.current = bgProgress
      // Check if we need to update the last assistant message or add a new one
      const lastMsg = chatMessages[chatMessages.length - 1]
      if (lastMsg && lastMsg.role === 'assistant' && lastMsg.actionCard?.type === 'background' && bgProgress < 100) {
        // Let state handle it or just let the user see toast.
      }
    }
    if (bgStatus === 'done') {
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Background cutout finished! Canvas updated.',
        timestamp: Date.now(),
        actionCard: {
          type: 'background',
          summary: 'Subject Segmented',
          details: 'Alpha mask applied to separate foreground.'
        }
      })
      lastProgressRef.current = 0
    } else if (bgStatus === 'error') {
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Background removal encountered an error.',
        timestamp: Date.now(),
        actionCard: {
          type: 'unknown',
          summary: 'Failed Cutout',
        }
      })
      lastProgressRef.current = 0
    }
  }, [bgStatus, bgProgress, isRemoving])

  async function handleSend() {
    const text = input.trim()
    if (!text) return
    if (!imageEl) return showToast('Upload a photo first', true)

    setInput('')
    setIsExpanded(true)

    // Add user message
    const userMsgId = Math.random().toString()
    addChatMessage({
      id: userMsgId,
      role: 'user',
      content: text,
      timestamp: Date.now()
    })

    setAiIsTyping(true)

    // Detect direct actions
    const action = detectAction(text)
    await sleep(400) // Aesthetic delay for natural assistant feel

    if (action === 'remove_background') {
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Starting background removal. Please wait...',
        timestamp: Date.now(),
        actionCard: {
          type: 'background',
          summary: 'Processing Cutout'
        }
      })
      setAiIsTyping(false)
      removeBg()
      return
    }

    if (action === 'undo') {
      undo()
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Reverted the last operation.',
        timestamp: Date.now(),
        actionCard: {
          type: 'undo',
          summary: 'Undo Applied'
        }
      })
      setAiIsTyping(false)
      return
    }

    if (action === 'redo') {
      redo()
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Redid the last operation.',
        timestamp: Date.now(),
        actionCard: {
          type: 'undo',
          summary: 'Redo Applied'
        }
      })
      setAiIsTyping(false)
      return
    }

    if (action === 'reset') {
      resetAllAdjustments()
      pushHistory('Reset All')
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Cleared all sliders and HSL shifts.',
        timestamp: Date.now(),
        actionCard: {
          type: 'reset',
          summary: 'Canvas Reset'
        }
      })
      setAiIsTyping(false)
      return
    }

    // Query Gemini — it returns scope + deltas
    try {
      const { deltas, source, scope } = await callAIPlanner(text)
      setAiIsTyping(false)

      if ('_unsupported' in deltas && deltas._unsupported) {
        addChatMessage({
          id: Math.random().toString(),
          role: 'assistant',
          content: 'Sorry, I couldn\'t map that to photo adjustments. Try something like "make it golden", "add cinematic look", or "warm the sky".',
          timestamp: Date.now()
        })
        return
      }

      const adjustmentsDeltas = deltas as Partial<Adjustments>

      // ─── Selective / masked edit ─────────────────────────────────────────────
      // When Gemini returns a non-global scope AND we have a backend image,
      // detect the mask for that region and apply deltas only inside it.
      if (scope !== 'global' && backendImageId) {
        // Map scope to the detect API type + UI label
        const scopeConfig: Record<string, { apiType: 'face' | 'subject' | 'sky'; label: string; invert: boolean }> = {
          sky:        { apiType: 'sky',     label: 'Sky Mask',        invert: false },
          face:       { apiType: 'face',    label: 'Face Mask',       invert: false },
          subject:    { apiType: 'subject', label: 'Subject Mask',    invert: false },
          background: { apiType: 'subject', label: 'Background Mask', invert: true  },
        }
        const cfg = scopeConfig[scope]

        if (cfg) {
          try {
            // Tell user we're detecting the region
            addChatMessage({
              id: Math.random().toString(),
              role: 'assistant',
              content: `Detecting ${cfg.label.toLowerCase()} for selective edit…`,
              timestamp: Date.now(),
            })

            const detectRes = await detectMask(backendImageId, cfg.apiType)

            // Create a new adjustment layer and set it active
            addAdjustmentLayer()
            const activeId = useEditorStore.getState().activeAdjustmentLayerId
            if (activeId) {
              // Name the layer and apply the mask to it
              useEditorStore.setState(s => ({
                adjustmentLayers: s.adjustmentLayers.map(l =>
                  l.id === activeId ? { ...l, name: cfg.label } : l
                )
              }))
              window.dispatchEvent(
                new CustomEvent('lumio_set_mask', {
                  detail: { layerId: activeId, maskBase64: detectRes.mask, invert: cfg.invert }
                })
              )
              // Apply deltas to the masked layer (activeAdjustmentLayerId is now set)
              applyAdjustmentDelta(adjustmentsDeltas)
              pushHistory(text)

              const detailsList = Object.entries(adjustmentsDeltas)
                .map(([k, v]) => `${k}: ${v! > 0 ? '+' : ''}${v}`)
                .join(', ')

              addChatMessage({
                id: Math.random().toString(),
                role: 'assistant',
                content: `Applied selective edit to ${cfg.label} only.`,
                timestamp: Date.now(),
                actionCard: {
                  type: 'adjustments',
                  summary: `${cfg.label} · ${Object.keys(adjustmentsDeltas).length} changes (${source === 'gemini' ? 'AI Planner ✦' : 'Rule Fallback ⚙'})`,
                  details: detailsList
                }
              })
            }
          } catch (err) {
            console.warn('[Lumio] Mask detection failed, falling back to global edit:', err)
            // Mask failed → apply globally with a note
            applyAdjustmentDelta(adjustmentsDeltas)
            pushHistory(text)
            addChatMessage({
              id: Math.random().toString(),
              role: 'assistant',
              content: `Couldn't detect the ${scope} automatically — applied globally instead.`,
              timestamp: Date.now(),
              actionCard: {
                type: 'adjustments',
                summary: `Global · ${Object.keys(adjustmentsDeltas).length} changes (${source === 'gemini' ? 'AI Planner ✦' : 'Rule Fallback ⚙'})`,
                details: Object.entries(adjustmentsDeltas).map(([k, v]) => `${k}: ${v! > 0 ? '+' : ''}${v}`).join(', ')
              }
            })
          }

          // Smart chips tracking
          const lo = text.toLowerCase()
          setAppliedChips(prev => {
            const next = new Set(prev)
            CHIPS.forEach(c => {
              const key = c.label.replace(/[^\w]/g, '').toLowerCase().slice(0, 5)
              if (lo.includes(key)) next.add(c.label)
            })
            return next
          })
          return // Done — masked path complete
        }
      }

      // ─── Global edit (scope === 'global' or no backendImageId) ───────────────
      applyAdjustmentDelta(adjustmentsDeltas)
      pushHistory(text)

      const appliedKeys = Object.keys(adjustmentsDeltas)
      const detailsList = Object.entries(adjustmentsDeltas)
        .map(([k, v]) => `${k}: ${v! > 0 ? '+' : ''}${v}`)
        .join(', ')

      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: `Applied to entire image.`,
        timestamp: Date.now(),
        actionCard: {
          type: 'adjustments',
          summary: `Global · ${appliedKeys.length} changes (${source === 'gemini' ? 'AI Planner ✦' : 'Rule Fallback ⚙'})`,
          details: detailsList
        }
      })

      // Smart chips tracking
      const lo = text.toLowerCase()
      setAppliedChips(prev => {
        const next = new Set(prev)
        CHIPS.forEach(c => {
          const key = c.label.replace(/[^\w]/g, '').toLowerCase().slice(0, 5)
          if (lo.includes(key)) next.add(c.label)
        })
        return next
      })

    } catch (err) {
      setAiIsTyping(false)
      addChatMessage({
        id: Math.random().toString(),
        role: 'assistant',
        content: 'Something went wrong processing your request. Please try again.',
        timestamp: Date.now()
      })
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  function useChip(chip: typeof CHIPS[0]) {
    setInput(chip.prompt)
    inputRef.current?.focus()
  }

  // Global key bindings
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
      if (e.key === 's' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('stamp')
      if (e.key === 't' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('text')
      if (e.key === 'i' && e.target instanceof Element && e.target.tagName !== 'INPUT') useEditorStore.getState().setActiveTool('pick')
      if (e.key === '?' && e.target instanceof Element && e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA' && !e.target.hasAttribute('contenteditable')) {
        e.preventDefault()
        const store = useEditorStore.getState()
        store.setShowShortcuts(!store.showShortcuts)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  return (
    <div style={{
      background: 'var(--s1)',
      borderTop: '1px solid var(--b1)',
      display: 'flex',
      flexDirection: 'column',
      flexShrink: 0,
      position: 'relative',
      zIndex: 50,
    }}>
      {/* Expandable Conversation View */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 260, opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{
              borderBottom: '1px solid var(--b1)',
              background: 'var(--s0)',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              padding: '16px 20px',
              gap: 12,
            }}
          >
            {chatMessages.length === 0 ? (
              <div style={{ display: 'flex', flex: 1, alignItems: 'center', justifyContent: 'center', color: 'var(--t3)', flexDirection: 'column', gap: 6 }}>
                <Sparkles size={24} style={{ opacity: 0.6 }} />
                <span>Assistant history is empty. Start a conversation below.</span>
              </div>
            ) : (
              chatMessages.map(msg => (
                <div
                  key={msg.id}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                    alignItems: 'flex-start',
                    gap: 10,
                  }}
                >
                  {/* Left avatar if AI */}
                  {msg.role === 'assistant' && (
                    <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ag)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--b2)', flexShrink: 0 }}>
                      <Sparkles size={12} color="var(--a2)" />
                    </div>
                  )}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxWidth: '75%' }}>
                    {/* Bubble */}
                    <div style={{
                      background: msg.role === 'user' ? 'var(--a)' : 'var(--s2)',
                      color: '#fff',
                      padding: '8px 12px',
                      borderRadius: msg.role === 'user' ? '12px 12px 2px 12px' : '12px 12px 12px 2px',
                      fontSize: 13,
                      lineHeight: 1.4,
                      border: msg.role === 'user' ? 'none' : '1px solid var(--b2)',
                    }}>
                      {msg.content}

                      {/* Action Card */}
                      {msg.actionCard && (
                        <div style={{
                          marginTop: 8,
                          padding: '8px 10px',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: '6px',
                          borderLeft: `3px solid ${
                            msg.actionCard.type === 'adjustments' ? 'var(--a2)' :
                            msg.actionCard.type === 'background' ? 'var(--green)' :
                            msg.actionCard.type === 'undo' ? 'var(--amber)' : 'var(--t2)'
                          }`,
                          fontSize: 12,
                        }}>
                          <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 5, color: 'var(--t1)' }}>
                            {msg.actionCard.type === 'adjustments' && <Check size={12} className="text-emerald-400" />}
                            {msg.actionCard.type === 'background' && <ArrowLeftRight size={12} color="var(--green)" />}
                            {msg.actionCard.type === 'undo' && <Undo2 size={12} color="var(--amber)" />}
                            {msg.actionCard.summary}
                          </div>
                          {msg.actionCard.details && (
                            <div style={{ color: 'var(--t2)', fontSize: 11, marginTop: 4, wordBreak: 'break-word' }}>
                              {msg.actionCard.details}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Timestamp */}
                    <span style={{ fontSize: 10, color: 'var(--t3)', alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </span>
                  </div>
                </div>
              ))
            )}

            {/* AI Typing Indicator */}
            {aiIsTyping && (
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--ag)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--b2)' }}>
                  <div className="animate-spin-lumio" style={{ width: 10, height: 10, border: '1.5px solid var(--b2)', borderTopColor: 'var(--a)', borderRadius: '50%' }} />
                </div>
                <span style={{ color: 'var(--t2)', fontSize: 12 }}>Assistant thinking...</span>
              </div>
            )}

            <div ref={chatEndRef} />
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ padding: '12px 14px 10px' }}>
        {/* Chips Row */}
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

        {/* Input Controls Row */}
        <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
          {/* Collapse/Expand Toggle */}
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? 'Collapse Chat' : 'Expand Chat'}
            style={{
              width: 42, height: 42, borderRadius: 'var(--r)',
              background: 'var(--s2)', border: '1px solid var(--b2)',
              color: 'var(--t2)', display: 'flex', alignItems: 'center',
              justifyContent: 'center', cursor: 'pointer'
            }}
          >
            {isExpanded ? <ChevronDown size={18} /> : <ChevronUp size={18} />}
          </motion.button>

          {/* Glowing input box */}
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
                placeholder="Describe your edit… e.g. cinematic, remove background, reset, undo"
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

          {/* Cutout / Background removal button */}
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

          {/* Send Prompt Button */}
          <motion.button
            whileTap={{ scale: 0.93 }}
            onClick={handleSend}
            disabled={!hasInput}
            title="Apply (Enter)"
            style={{
              width: 42, height: 42, flexShrink: 0,
              background: hasInput
                ? 'linear-gradient(130deg, var(--a), var(--rose))'
                : 'var(--s3)',
              border: `1px solid ${hasInput ? 'transparent' : 'var(--b2)'}`,
              borderRadius: 'var(--r)',
              color: hasInput ? '#fff' : 'var(--t3)',
              cursor: hasInput ? 'pointer' : 'default',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: hasInput ? '0 4px 18px rgba(124,111,255,.36)' : 'none',
              transition: 'all var(--fast)',
            }}
          >
            <Send size={18} strokeWidth={2} />
          </motion.button>
        </div>

        {/* Clear chat button & Keyboard Helpers Row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexWrap: 'wrap' }}>
          {[
            { key: 'Enter', desc: 'apply' },
            { key: 'Space', desc: 'compare original' },
            { key: 'Ctrl+Z', desc: 'undo' },
            { key: 'Ctrl+Shift+Z', desc: 'redo' },
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

          {chatMessages.length > 0 && (
            <>
              <span style={{ color: 'var(--b2)', fontSize: 12 }}>·</span>
              <button
                onClick={clearChat}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none',
                  color: 'var(--red)', fontSize: 11, cursor: 'pointer', opacity: 0.8,
                }}
                onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
              >
                <Trash2 size={12} />
                Clear History
              </button>
            </>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6, padding: '3px 10px', background: 'var(--ag)', border: '1px solid rgba(124,111,255,.22)', borderRadius: 20, fontSize: 11, color: 'var(--a2)' }}>
            <div className="animate-blink" style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--a)' }} />
            Gemini ready
          </div>
        </div>
      </div>
    </div>
  )
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

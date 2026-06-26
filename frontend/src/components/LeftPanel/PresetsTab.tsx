import { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Star, Check } from 'lucide-react'
import { useEditorStore } from '../../store/editorStore'
import type { Adjustments } from '../../store/editorStore'
import { renderPresetPreview } from '../../engine/pixelPipeline'

// ─── Extended Preset Catalog ─────────────────────────────────────────────────
interface Preset {
  name: string
  category: string
  emoji: string
  adjustments: Partial<Adjustments>
}

const PRESET_CATALOG: Preset[] = [
  // ── Cinematic ──────────────────────────────────────────────────────────────
  { name: 'Cinema',       category: 'Cinematic', emoji: '🎬', adjustments: { contrast: 28, temperature: -20, saturation: 18, vignette: -42, clarity: 14 } },
  { name: 'Moody',        category: 'Cinematic', emoji: '🌙', adjustments: { exposure: -14, contrast: 32, saturation: -24, vignette: -52, shadows: -12 } },
  { name: 'Teal+Orange',  category: 'Cinematic', emoji: '◑',  adjustments: { temperature: -16, tint: -10, saturation: 24, contrast: 18 } },
  { name: 'Dramatic',     category: 'Cinematic', emoji: '⚡', adjustments: { contrast: 38, clarity: 42, saturation: 20, dehaze: 28, vignette: -35 } },
  { name: 'Noir',         category: 'Cinematic', emoji: '🖤', adjustments: { saturation: -100, contrast: 32, clarity: 24, vignette: -50, brightness: -10 } },

  // ── Portrait ───────────────────────────────────────────────────────────────
  { name: 'Portrait',     category: 'Portrait',  emoji: '👤', adjustments: { brightness: 10, vibrance: 15, clarity: -8, glow: 12, highlights: -8 } },
  { name: 'Glow',         category: 'Portrait',  emoji: '✨', adjustments: { brightness: 14, saturation: -8, glow: 42, clarity: -18, fade: 22 } },
  { name: 'Warm Skin',    category: 'Portrait',  emoji: '🌸', adjustments: { temperature: 22, vibrance: 18, brightness: 8, clarity: -6, glow: 10 } },
  { name: 'Editorial',    category: 'Portrait',  emoji: '📰', adjustments: { contrast: 22, clarity: 16, vibrance: 10, vignette: -30, highlights: -15 } },
  { name: 'Fresh',        category: 'Portrait',  emoji: '💧', adjustments: { exposure: 8, saturation: -12, vibrance: 20, clarity: -4, brightness: 6 } },

  // ── Fashion ────────────────────────────────────────────────────────────────
  { name: 'Fashion',      category: 'Fashion',   emoji: '👗', adjustments: { contrast: 18, clarity: 14, vibrance: 12, vignette: -28, whites: 12 } },
  { name: 'Luxury',       category: 'Fashion',   emoji: '💎', adjustments: { exposure: -8, contrast: 22, saturation: -12, clarity: 18, vignette: -36, fade: 8 } },
  { name: 'High Fashion', category: 'Fashion',   emoji: '🌟', adjustments: { contrast: 28, clarity: 20, saturation: -18, vignette: -45, highlights: -12 } },
  { name: 'Matte',        category: 'Fashion',   emoji: '□',  adjustments: { contrast: -24, brightness: 10, saturation: -20, fade: 28 } },
  { name: 'Urban',        category: 'Fashion',   emoji: '🏙️', adjustments: { contrast: 24, clarity: 18, saturation: -10, vignette: -32, blacks: -15 } },

  // ── Color Grading ──────────────────────────────────────────────────────────
  { name: 'Golden Hour',  category: 'Color',     emoji: '🌅', adjustments: { temperature: 42, brightness: 8, saturation: 24, vibrance: 14 } },
  { name: 'Cool Blue',    category: 'Color',     emoji: '❄️', adjustments: { temperature: -38, saturation: 16, vibrance: 12, clarity: 8 } },
  { name: 'Vivid',        category: 'Color',     emoji: '✦',  adjustments: { saturation: 44, vibrance: 30, contrast: 18, clarity: 12 } },
  { name: 'Pastel',       category: 'Color',     emoji: '🎨', adjustments: { saturation: -30, brightness: 14, fade: 20, contrast: -12 } },
  { name: 'Vibrant',      category: 'Color',     emoji: '🌈', adjustments: { saturation: 60, vibrance: 40, contrast: 10, clarity: 8 } },

  // ── Film ───────────────────────────────────────────────────────────────────
  { name: 'Kodak',        category: 'Film',      emoji: '📷', adjustments: { temperature: 18, saturation: 16, contrast: 10, highlights: -12, fade: 10 } },
  { name: 'Vintage',      category: 'Film',      emoji: '📼', adjustments: { saturation: -20, contrast: -15, temperature: 20, grain: 28, fade: 20 } },
  { name: 'Faded',        category: 'Film',      emoji: '〰', adjustments: { contrast: -28, brightness: 16, saturation: -28, fade: 36 } },
  { name: 'Velvia',       category: 'Film',      emoji: '🍃', adjustments: { saturation: 58, contrast: 22, vibrance: 18, sharpness: 28 } },
  { name: 'Grain+Fade',   category: 'Film',      emoji: '🎞️', adjustments: { grain: 35, fade: 25, saturation: -15, temperature: 12 } },

  // ── Landscape & Nature ─────────────────────────────────────────────────────
  { name: 'Landscape',    category: 'Nature',    emoji: '🏔', adjustments: { vibrance: 28, dehaze: 22, clarity: 18, saturation: 14, shadows: 12 } },
  { name: 'Forest',       category: 'Nature',    emoji: '🌲', adjustments: { saturation: 22, vibrance: 18, clarity: 16, temperature: -8, shadows: 16 } },
  { name: 'Sunset',       category: 'Nature',    emoji: '🌄', adjustments: { temperature: 36, saturation: 28, contrast: 14, highlights: -10 } },
  { name: 'Misty',        category: 'Nature',    emoji: '🌫️', adjustments: { brightness: 12, saturation: -18, fade: 16, clarity: -10, dehaze: -20 } },
  { name: 'Ocean',        category: 'Nature',    emoji: '🌊', adjustments: { temperature: -22, saturation: 20, clarity: 14, vibrance: 16, dehaze: 18 } },
]

const CATEGORIES = ['All', 'Cinematic', 'Portrait', 'Fashion', 'Color', 'Film', 'Nature']

// ─── Thumbnail canvas per preset ─────────────────────────────────────────────
function PresetThumb({
  preset,
  imageEl,
  isActive,
  isHovered,
  onClick,
  onHover,
}: {
  preset: Preset
  imageEl: HTMLImageElement | null
  isActive: boolean
  isHovered: boolean
  onClick: () => void
  onHover: (enter: boolean) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (!imageEl || !canvasRef.current) return
    renderPresetPreview(imageEl, canvasRef.current, preset.adjustments)
  }, [imageEl, preset.adjustments])

  return (
    <motion.div
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.97 }}
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      title={preset.name}
      style={{
        position: 'relative',
        borderRadius: 9,
        cursor: 'pointer',
        overflow: 'hidden',
        border: `2px solid ${isActive ? 'var(--a)' : isHovered ? 'rgba(255,255,255,0.2)' : 'transparent'}`,
        boxShadow: isActive
          ? '0 0 0 1px var(--a), 0 4px 16px rgba(99,102,241,0.3)'
          : isHovered ? '0 2px 12px rgba(0,0,0,0.4)' : 'none',
        transition: 'border-color 0.15s, box-shadow 0.15s',
        aspectRatio: '1',
        background: 'var(--s3)',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
      />
      {/* Gradient label overlay */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)',
        padding: '14px 6px 5px',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: '#fff', letterSpacing: '0.03em', textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
          {preset.name}
        </span>
        {isActive && (
          <div style={{
            width: 14, height: 14, borderRadius: '50%',
            background: 'var(--a)', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <Check size={8} color="#fff" />
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Main Presets Tab ─────────────────────────────────────────────────────────
export function PresetsTab() {
  const imageEl = useEditorStore(s => s.imageEl)

  const setAdjustment = useEditorStore(s => s.setAdjustment)
  const resetAllAdjustments = useEditorStore(s => s.resetAllAdjustments)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const showToast = useEditorStore(s => s.showToast)
  const customPresets = useEditorStore(s => s.customPresets)
  const saveCustomPreset = useEditorStore(s => s.saveCustomPreset)
  const deleteCustomPreset = useEditorStore(s => s.deleteCustomPreset)

  const [activeCategory, setActiveCategory] = useState('All')
  const [activePreset, setActivePreset] = useState<string | null>(null)
  const [hoveredPreset, setHoveredPreset] = useState<string | null>(null)
  const [saveName, setSaveName] = useState('')
  const [showSaveInput, setShowSaveInput] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const previewApplied = useRef(false)
  const savedAdjustments = useRef<Partial<Adjustments> | null>(null)

  const filtered = PRESET_CATALOG.filter(p => {
    const matchCat = activeCategory === 'All' || p.category === activeCategory
    const matchSearch = !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase())
    return matchCat && matchSearch
  })

  function applyPreset(preset: Preset) {
    if (!imageEl) { showToast('Upload a photo first', true); return }
    // Restore from preview if needed
    if (previewApplied.current && savedAdjustments.current) {
      savedAdjustments.current = null
      previewApplied.current = false
    }
    resetAllAdjustments()
    for (const [k, v] of Object.entries(preset.adjustments)) {
      setAdjustment(k as keyof Adjustments, v as number)
    }
    setActivePreset(preset.name)
    pushHistory(`Preset: ${preset.name}`)
    showToast(`Applied: ${preset.name}`)
  }

  function applyCustomPreset(p: typeof customPresets[0]) {
    if (!imageEl) { showToast('Upload a photo first', true); return }
    resetAllAdjustments()
    for (const [k, v] of Object.entries(p.adjustments)) {
      setAdjustment(k as keyof Adjustments, v as number)
    }
    setActivePreset(`custom:${p.name}`)
    pushHistory(`Preset: ${p.name}`)
    showToast(`Applied: ${p.name}`)
  }

  function handleSave() {
    const name = saveName.trim()
    if (!name) return
    if (!imageEl) { showToast('Upload a photo first', true); return }
    saveCustomPreset(name)
    setSaveName('')
    setShowSaveInput(false)
    showToast(`Saved preset "${name}"`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ── Search bar ─────────────────────────────────────────────────────── */}
      <div style={{ padding: '10px 10px 6px', flexShrink: 0 }}>
        <input
          type="text"
          placeholder="Search presets…"
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          style={{
            width: '100%', height: 30, background: 'var(--s2)',
            border: '1px solid var(--b1)', borderRadius: 'var(--r)',
            padding: '0 10px', fontSize: 11.5, color: 'var(--t1)',
            outline: 'none', boxSizing: 'border-box',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.currentTarget.style.borderColor = 'var(--a)'}
          onBlur={e => e.currentTarget.style.borderColor = 'var(--b1)'}
        />
      </div>

      {/* ── Category pills ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 4, padding: '0 10px 8px',
        flexShrink: 0, overflowX: 'auto', scrollbarWidth: 'none',
      }}>
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            style={{
              flexShrink: 0,
              height: 24, padding: '0 10px',
              borderRadius: 12,
              border: `1px solid ${activeCategory === cat ? 'var(--a)' : 'var(--b1)'}`,
              background: activeCategory === cat ? 'var(--a)' : 'var(--s2)',
              color: activeCategory === cat ? '#fff' : 'var(--t2)',
              fontSize: 10.5, fontWeight: 600, cursor: 'pointer',
              transition: 'all 0.15s',
              letterSpacing: '0.02em',
            }}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* ── Preset Grid ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px', scrollbarWidth: 'thin' }}>
        {/* Built-in presets */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 6,
          marginBottom: 16,
        }}>
          {filtered.map(preset => (
            <PresetThumb
              key={preset.name}
              preset={preset}
              imageEl={imageEl}
              isActive={activePreset === preset.name}
              isHovered={hoveredPreset === preset.name}
              onClick={() => applyPreset(preset)}
              onHover={enter => setHoveredPreset(enter ? preset.name : null)}
            />
          ))}
        </div>

        {/* ── My Presets section ─────────────────────────────────────────── */}
        {(activeCategory === 'All' || activeCategory === 'My Presets') && (
          <div style={{ borderTop: '1px solid var(--b1)', paddingTop: 12, marginBottom: 16 }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 10,
            }}>
              <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--t2)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                <Star size={9} style={{ marginRight: 4, verticalAlign: 'middle' }} />
                My Presets ({customPresets.length})
              </span>
              <button
                onClick={() => setShowSaveInput(s => !s)}
                title="Save current settings as preset"
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  height: 24, padding: '0 8px',
                  background: 'var(--ag2)', border: '1px solid var(--a)',
                  borderRadius: 12, color: 'var(--a)', fontSize: 10, fontWeight: 600,
                  cursor: 'pointer', transition: 'all 0.15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--a)'; e.currentTarget.style.color = '#fff' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'var(--ag2)'; e.currentTarget.style.color = 'var(--a)' }}
              >
                <Plus size={10} />
                Save Current
              </button>
            </div>

            {/* Save input */}
            <AnimatePresence>
              {showSaveInput && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  style={{ overflow: 'hidden', marginBottom: 10 }}
                >
                  <div style={{ display: 'flex', gap: 6, paddingTop: 2 }}>
                    <input
                      autoFocus
                      type="text"
                      placeholder="Preset name…"
                      value={saveName}
                      onChange={e => setSaveName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setShowSaveInput(false) }}
                      style={{
                        flex: 1, height: 28, background: 'var(--s2)',
                        border: '1px solid var(--a)', borderRadius: 'var(--r)',
                        padding: '0 8px', fontSize: 11.5, color: 'var(--t1)', outline: 'none',
                      }}
                    />
                    <button
                      onClick={handleSave}
                      disabled={!saveName.trim()}
                      style={{
                        height: 28, padding: '0 12px',
                        background: saveName.trim() ? 'var(--a)' : 'var(--s3)',
                        color: saveName.trim() ? '#fff' : 'var(--t3)',
                        border: 'none', borderRadius: 'var(--r)',
                        fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                    >
                      Save
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Custom preset pills */}
            {customPresets.length === 0 ? (
              <div style={{ fontSize: 11, color: 'var(--t3)', textAlign: 'center', padding: '12px 0' }}>
                Adjust the sliders and save your first preset
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {customPresets.map(p => {
                  const isActive = activePreset === `custom:${p.name}`
                  return (
                    <motion.div
                      key={p.name}
                      whileHover={{ x: 2 }}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '7px 10px',
                        background: isActive ? 'var(--ag2)' : 'var(--s2)',
                        border: `1px solid ${isActive ? 'var(--a)' : 'var(--b1)'}`,
                        borderRadius: 'var(--r)',
                        cursor: 'pointer',
                        transition: 'all 0.15s',
                      }}
                      onClick={() => applyCustomPreset(p)}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {isActive && <Check size={11} color="var(--a)" />}
                        <span style={{ fontSize: 12, color: 'var(--t1)', fontWeight: isActive ? 600 : 400 }}>
                          {p.name}
                        </span>
                      </div>
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          deleteCustomPreset(p.name)
                          if (isActive) setActivePreset(null)
                          showToast(`Deleted "${p.name}"`)
                        }}
                        style={{
                          background: 'none', border: 'none', color: 'var(--t3)',
                          cursor: 'pointer', padding: 4, display: 'flex', alignItems: 'center',
                          borderRadius: 4, transition: 'color 0.15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.color = '#f87171'}
                        onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                      >
                        <Trash2 size={12} />
                      </button>
                    </motion.div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* No results message */}
        {filtered.length === 0 && (
          <div style={{ textAlign: 'center', padding: '32px 16px', color: 'var(--t3)' }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>🔍</div>
            <div style={{ fontSize: 12 }}>No presets found for "{searchQuery}"</div>
          </div>
        )}
      </div>
    </div>
  )
}

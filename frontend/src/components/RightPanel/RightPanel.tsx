import React, { useRef, useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Download } from 'lucide-react'
import { useEditorStore, HSL_NAMES } from '../../store/editorStore'
import type { Adjustments, HSLName, GradingWheel } from '../../store/editorStore'
import { PRESETS } from '../../data/presets'
import { renderPresetPreview } from '../../engine/pixelPipeline'

// ─── Color Grading Wheel component ──────────────────────────────────────────
function ColorGradingWheel({
  label,
  value,
  onChange,
  onReset,
}: {
  label: string
  value: GradingWheel
  onChange: (prop: 'h' | 's' | 'l', val: number) => void
  onReset: () => void
}) {
  const wheelRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  const R = 50 // wheel radius
  const angleRad = (value.h * Math.PI) / 180
  const dist = (value.s / 100) * R
  const hx = R + dist * Math.cos(angleRad)
  const hy = R + dist * Math.sin(angleRad)

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(true)
    updateColor(e)
  }

  const updateColor = (e: PointerEvent | React.PointerEvent) => {
    if (!wheelRef.current) return
    const rect = wheelRef.current.getBoundingClientRect()
    const cx = rect.left + rect.width / 2
    const cy = rect.top + rect.height / 2
    const dx = e.clientX - cx
    const dy = e.clientY - cy

    let angle = Math.atan2(dy, dx) * (180 / Math.PI)
    if (angle < 0) angle += 360
    const distance = Math.min(R, Math.sqrt(dx * dx + dy * dy))
    const sat = Math.round((distance / R) * 100)
    const hue = Math.round(angle)

    onChange('h', hue)
    onChange('s', sat)
  }

  useEffect(() => {
    if (!isDragging) return
    const handlePointerMove = (e: PointerEvent) => {
      updateColor(e)
    }
    const handlePointerUp = () => {
      setIsDragging(false)
      useEditorStore.getState().pushHistory(`Adjust Color Grading (${label})`)
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [isDragging])

  const colorStr = `hsl(${value.h}, ${value.s}%, 50%)`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, width: '100%', padding: '8px 0' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', fontSize: 11, color: 'var(--t2)', fontWeight: 500 }}>
        <span style={{ fontSize: 11, color: 'var(--t1)', fontWeight: 600 }}>{label}</span>
        <button onClick={onReset} style={{ background: 'none', border: 'none', color: 'var(--t3)', cursor: 'pointer', fontSize: 10 }}>Reset</button>
      </div>

      <div
        ref={wheelRef}
        onPointerDown={handlePointerDown}
        style={{
          position: 'relative',
          width: R * 2,
          height: R * 2,
          borderRadius: '50%',
          cursor: 'crosshair',
          background: 'conic-gradient(from 0deg, red, yellow, lime, cyan, blue, magenta, red)',
          boxShadow: 'inset 0 0 12px rgba(0,0,0,0.5)',
          border: '1.5px solid var(--b2)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0) 85%)',
            pointerEvents: 'none',
          }}
        />
        <div
          style={{
            position: 'absolute',
            left: hx - 5,
            top: hy - 5,
            width: 10,
            height: 10,
            borderRadius: '50%',
            border: '1.5px solid #fff',
            background: colorStr,
            boxShadow: '0 0 4px rgba(0,0,0,0.8)',
            pointerEvents: 'none',
          }}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, fontSize: 10, color: 'var(--t2)' }}>
        <span>H: {value.h}°</span>
        <span>S: {value.s}%</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}>
        <span style={{ fontSize: 11, color: 'var(--t2)', width: 60 }}>Luminance</span>
        <input
          type="range"
          min={-100}
          max={100}
          value={value.l}
          onChange={e => onChange('l', parseInt(e.target.value))}
          style={{ flex: 1 }}
          onPointerUp={() => useEditorStore.getState().pushHistory(`Adjust Color Grading (${label} Luminance)`)}
        />
        <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{value.l}</span>
      </div>
    </div>
  )
}

// ─── Slider component ─────────────────────────────────────────────────────────
function Slider({
  label, adjKey, min, max,
}: {
  label: string
  adjKey: keyof Adjustments
  min: number
  max: number
}) {
  const value = useEditorStore(s => {
    if (s.activeAdjustmentLayerId) {
      const layer = s.adjustmentLayers.find(l => l.id === s.activeAdjustmentLayerId)
      if (layer) return layer.adjustments[adjKey]
    }
    return s.adjustments[adjKey]
  })
  const setAdjustment = useEditorStore(s => s.setAdjustment)
  const imageEl = useEditorStore(s => s.imageEl)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value)
    setAdjustment(adjKey, v)
    if (imageEl) {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current)
      snapTimerRef.current = setTimeout(() => { pushHistory(`${label} → ${v}`) }, 820)
    }
  }

  const fp = ((value - min) / (max - min) * 100).toFixed(2) + '%'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span style={{ fontSize: 11.5, color: 'var(--t2)', width: 80, flexShrink: 0, lineHeight: 1.3 }}>{label}</span>
      <input
        type="range"
        className="lumio-slider"
        min={min}
        max={max}
        value={value}
        onChange={onChange}
        style={{ '--fp': fp } as React.CSSProperties}
      />
      <span
        onDoubleClick={() => { setAdjustment(adjKey, 0); if (imageEl) pushHistory(`Reset ${label}`) }}
        title="double-click to reset"
        style={{
          fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right',
          fontVariantNumeric: 'tabular-nums', cursor: 'pointer', borderRadius: 4,
          transition: 'color var(--fast)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--a2)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--t2)')}
      >
        {value}
      </span>
    </div>
  )
}

// ─── Collapsible section ──────────────────────────────────────────────────────
function Section({
  id, title, children, onReset,
}: {
  id: string
  title: string
  children: React.ReactNode
  onReset?: () => void
}) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div id={id} style={{ borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
      <div
        onClick={() => setCollapsed(c => !c)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px', cursor: 'pointer', userSelect: 'none',
          transition: 'background var(--fast)',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--s2)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--t3)' }}>
          {title}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {onReset && (
            <button
              onClick={e => { e.stopPropagation(); onReset() }}
              style={{
                fontSize: 10, color: 'var(--t3)', background: 'none', border: 'none',
                cursor: 'pointer', padding: '2px 6px', borderRadius: 4,
                transition: 'color var(--fast), background var(--fast)',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = 'var(--a2)'; e.currentTarget.style.background = 'var(--ag2)' }}
              onMouseLeave={e => { e.currentTarget.style.color = 'var(--t3)'; e.currentTarget.style.background = 'none' }}
            >
              Reset
            </button>
          )}
          <ChevronDown
            size={12}
            color="var(--t3)"
            style={{ transition: 'transform var(--fast)', transform: collapsed ? 'rotate(-90deg)' : 'none' }}
          />
        </div>
      </div>
      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ padding: '0 12px 12px' }}>{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ─── Preset grid ──────────────────────────────────────────────────────────────
function PresetGrid() {
  const imageEl = useEditorStore(s => s.imageEl)
  const setAdjustment = useEditorStore(s => s.setAdjustment)
  const resetAllAdjustments = useEditorStore(s => s.resetAllAdjustments)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const showToast = useEditorStore(s => s.showToast)
  const customPresets = useEditorStore(s => s.customPresets)
  const saveCustomPreset = useEditorStore(s => s.saveCustomPreset)
  const deleteCustomPreset = useEditorStore(s => s.deleteCustomPreset)

  const [activePreset, setActivePreset] = useState<number | string | null>(0)
  const [presetName, setPresetName] = useState('')
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([])

  // Build preset previews when image changes
  useEffect(() => {
    if (!imageEl) return
    PRESETS.forEach((preset, i) => {
      const cv = canvasRefs.current[i]
      if (cv) renderPresetPreview(imageEl, cv, preset.adjustments)
    })
  }, [imageEl])

  function applyPreset(idx: number) {
    if (!imageEl) return
    setActivePreset(idx)
    resetAllAdjustments()
    const preset = PRESETS[idx]
    for (const [k, v] of Object.entries(preset.adjustments)) {
      setAdjustment(k as keyof Adjustments, v as number)
    }
    pushHistory(`Preset: ${preset.name}`)
    showToast(`Preset: ${preset.name}`)
  }

  function handleSavePreset() {
    const name = presetName.trim()
    if (!name) return
    if (!imageEl) return showToast('Upload a photo first', true)
    saveCustomPreset(name)
    setPresetName('')
    showToast(`Saved preset "${name}"`)
  }

  function applyCustom(p: typeof customPresets[0], idx: number) {
    if (!imageEl) return
    setActivePreset(`custom-${idx}`)
    resetAllAdjustments()
    for (const [k, v] of Object.entries(p.adjustments)) {
      setAdjustment(k as keyof Adjustments, v as number)
    }
    pushHistory(`Preset: ${p.name}`)
    showToast(`Preset: ${p.name}`)
  }

  return (
    <div>
      {/* Default Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5, marginBottom: 12 }}>
        {PRESETS.map((preset, i) => (
          <motion.div
            key={preset.name}
            whileHover={{ scale: 1.07 }}
            whileTap={{ scale: 0.96 }}
            onClick={() => applyPreset(i)}
            title={preset.name}
            style={{
              aspectRatio: '1', borderRadius: 7, cursor: 'pointer',
              border: `2px solid ${activePreset === i ? 'var(--a)' : 'transparent'}`,
              position: 'relative', overflow: 'hidden',
              boxShadow: activePreset === i ? '0 0 0 1px var(--a)' : 'none',
            }}
          >
            <canvas
              ref={el => { canvasRefs.current[i] = el }}
              style={{ width: '100%', height: '100%', display: 'block', background: 'var(--s4)' }}
            />
            <div style={{
              position: 'absolute', bottom: 0, left: 0, right: 0,
              background: 'rgba(0,0,0,0.68)', color: '#fff',
              fontSize: 8.5, fontWeight: 600, textAlign: 'center', padding: '2px 0',
            }}>
              {preset.name}
            </div>
          </motion.div>
        ))}
      </div>

      {/* Custom Presets Section */}
      <div style={{ borderTop: '1px solid var(--b2)', paddingTop: 10, marginTop: 8 }}>
        <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--t2)', marginBottom: 8, letterSpacing: '0.04em', textTransform: 'uppercase' }}>
          My Presets ({customPresets.length})
        </div>

        {customPresets.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
            {customPresets.map((p, idx) => {
              const isActive = activePreset === `custom-${idx}`
              return (
                <div
                  key={p.name}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 4,
                    background: isActive ? 'var(--ag2)' : 'var(--s2)',
                    border: `1px solid ${isActive ? 'var(--a)' : 'var(--b1)'}`,
                    borderRadius: 14, padding: '2px 8px 2px 10px',
                    fontSize: 11, color: 'var(--t1)', cursor: 'pointer',
                  }}
                  onClick={() => applyCustom(p, idx)}
                >
                  <span>{p.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteCustomPreset(p.name)
                      showToast(`Deleted preset "${p.name}"`)
                    }}
                    style={{
                      background: 'none', border: 'none', color: 'var(--t3)',
                      cursor: 'pointer', fontSize: 10, padding: '0 2px',
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                  >
                    ×
                  </button>
                </div>
              )
            })}
          </div>
        )}

        {/* Creator Input */}
        <div style={{ display: 'flex', gap: 6 }}>
          <input
            type="text"
            placeholder="Preset name..."
            value={presetName}
            onChange={(e) => setPresetName(e.target.value)}
            style={{
              flex: 1, height: 28, background: 'var(--s2)',
              border: '1px solid var(--b1)', borderRadius: 'var(--r)',
              padding: '0 8px', fontSize: 11.5, color: 'var(--t1)',
              outline: 'none',
            }}
          />
          <button
            onClick={handleSavePreset}
            disabled={!presetName.trim()}
            style={{
              height: 28, padding: '0 12px',
              background: presetName.trim() ? 'var(--a)' : 'var(--s3)',
              color: presetName.trim() ? '#fff' : 'var(--t3)',
              border: 'none', borderRadius: 'var(--r)',
              fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
              transition: 'all var(--fast)',
            }}
          >
            Save Preset
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Right Panel ──────────────────────────────────────────────────────────────
export function RightPanel() {
  const imageEl = useEditorStore(s => s.imageEl)
  const activeAdjustmentLayer = useEditorStore(s => s.adjustmentLayers.find(l => l.id === s.activeAdjustmentLayerId))
  const resetSectionKeys = useEditorStore(s => s.resetSectionKeys)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const curves = useEditorStore(s => activeAdjustmentLayer ? activeAdjustmentLayer.curves : s.curves)
  const setCurvesChannel = useEditorStore(s => s.setCurvesChannel)
  const colorGrading = useEditorStore(s => activeAdjustmentLayer ? activeAdjustmentLayer.colorGrading : s.colorGrading)
  const setColorGradingChannel = useEditorStore(s => s.setColorGradingChannel)

  const [curveChannel, setCurveChannel] = useState<'rgb' | 'red' | 'green' | 'blue'>('rgb')
  const [draggedPointIndex, setDraggedPointIndex] = useState<number | null>(null)
  const [gradingTab, setGradingTab] = useState<'shadows' | 'midtones' | 'highlights'>('shadows')
  const hsl = useEditorStore(s => s.hsl)
  const activeHSL = useEditorStore(s => s.activeHSL)
  const setActiveHSL = useEditorStore(s => s.setActiveHSL)
  const setHSLChannel = useEditorStore(s => s.setHSLChannel)
  const exportFormat = useEditorStore(s => s.exportFormat)
  const exportQuality = useEditorStore(s => s.exportQuality)
  const setExportFormat = useEditorStore(s => s.setExportFormat)
  const setExportQuality = useEditorStore(s => s.setExportQuality)
  const showToast = useEditorStore(s => s.showToast)

  // Text Layers selectors
  const textLayers = useEditorStore(s => s.textLayers)
  const activeTextLayerId = useEditorStore(s => s.activeTextLayerId)
  const updateTextLayer = useEditorStore(s => s.updateTextLayer)
  const removeTextLayer = useEditorStore(s => s.removeTextLayer)
  const setActiveTextLayer = useEditorStore(s => s.setActiveTextLayer)

  // Shape Layers selectors
  const shapeLayers = useEditorStore(s => s.shapeLayers)
  const activeShapeLayerId = useEditorStore(s => s.activeShapeLayerId)
  const updateShapeLayer = useEditorStore(s => s.updateShapeLayer)
  const removeShapeLayer = useEditorStore(s => s.removeShapeLayer)
  const setActiveShapeLayer = useEditorStore(s => s.setActiveShapeLayer)

  // Expose the histogram canvas ref so Canvas.tsx can use it
  useEffect(() => {
    // Canvas component draws the histogram onto a hidden canvas,
    // which is then read by RightPanel via a subscription
    const unsub = useEditorStore.subscribe(
      s => s.adjustments,
      () => {
        // Histogram is updated inside Canvas renderCanvas — nothing to do here
      }
    )
    return unsub
  }, [])

  function doExport() {
    if (!imageEl) return showToast('Load a photo first', true)
    const cv = document.querySelector<HTMLCanvasElement>('#lumio-main-canvas')
    if (!cv) return showToast('Canvas not ready', true)
    const ctx = cv.getContext('2d')!
    const tempImage = ctx.getImageData(0, 0, cv.width, cv.height)
    
    // Draw text layers to the exported canvas at original image resolution
    textLayers.forEach(layer => {
      ctx.save()
      ctx.globalAlpha = layer.opacity / 100
      ctx.fillStyle = layer.color
      
      const canvasDisplayWidth = cv.getBoundingClientRect().width || cv.width
      const scale = cv.width / canvasDisplayWidth
      const naturalFontSize = layer.fontSize * scale
      
      ctx.font = `${layer.fontWeight} ${naturalFontSize}px sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      
      const x = layer.x * cv.width
      const y = layer.y * cv.height
      ctx.fillText(layer.text, x, y)
      ctx.restore()
    })

    // Draw shape layers to the exported canvas
    shapeLayers.forEach(layer => {
      ctx.save()
      ctx.globalAlpha = layer.opacity / 100
      ctx.fillStyle = layer.fill
      ctx.strokeStyle = layer.stroke
      const canvasDisplayWidth = cv.getBoundingClientRect().width || cv.width
      const scale = cv.width / canvasDisplayWidth
      ctx.lineWidth = layer.strokeWidth * scale
      
      const x = layer.x * cv.width
      const y = layer.y * cv.height
      const w = layer.w * cv.width
      const h = layer.h * cv.height
      
      if (layer.type === 'rect') {
        ctx.fillRect(x, y, w, h)
        if (layer.strokeWidth > 0) {
          ctx.strokeRect(x, y, w, h)
        }
      } else {
        ctx.beginPath()
        ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
        ctx.fill()
        if (layer.strokeWidth > 0) {
          ctx.stroke()
        }
      }
      ctx.restore()
    })

    const q = exportQuality / 100
    const link = document.createElement('a')
    if (exportFormat === 'png') {
      link.href = cv.toDataURL('image/png')
      link.download = 'lumio-export.png'
    } else if (exportFormat === 'webp') {
      link.href = cv.toDataURL('image/webp', q)
      link.download = 'lumio-export.webp'
    } else {
      link.href = cv.toDataURL('image/jpeg', q)
      link.download = 'lumio-export.jpg'
    }
    link.click()

    ctx.putImageData(tempImage, 0, 0)
    showToast(`Exported as ${exportFormat.toUpperCase()}`)
  }

  const setActiveAdjustmentLayer = useEditorStore(s => s.setActiveAdjustmentLayer)
  const activeTool = useEditorStore(s => s.activeTool)
  const setActiveTool = useEditorStore(s => s.setActiveTool)
  
  // Custom event or state for mask settings if we want RightPanel to share it
  // Let's read/write mask brush settings. We can save them to window or a global ref, or keep them local.
  // Actually, we can dispatch/listen or store in window context for Canvas.tsx to read.
  const [maskBrushSize, setMaskBrushSize] = useState(() => {
    return parseInt(localStorage.getItem('lumio_mask_brush_size') || '30')
  })
  const [isMaskEraser, setIsMaskEraser] = useState(() => {
    return localStorage.getItem('lumio_is_mask_eraser') === 'true'
  })

  useEffect(() => {
    localStorage.setItem('lumio_mask_brush_size', maskBrushSize.toString())
    window.dispatchEvent(new CustomEvent('lumio_mask_brush_size_change', { detail: maskBrushSize }))
  }, [maskBrushSize])

  useEffect(() => {
    localStorage.setItem('lumio_is_mask_eraser', isMaskEraser.toString())
    window.dispatchEvent(new CustomEvent('lumio_is_mask_eraser_change', { detail: isMaskEraser }))
  }, [isMaskEraser])

  // Listen to tool changes to potentially toggle eraser off
  useEffect(() => {
    if (activeTool !== 'mask') {
      // do nothing
    }
  }, [activeTool])

  const HSL_COLORS = [
    { name: 'Red' as HSLName,    bg: 'hsl(0,72%,48%)' },
    { name: 'Orange' as HSLName, bg: 'hsl(28,82%,52%)' },
    { name: 'Yellow' as HSLName, bg: 'hsl(52,90%,46%)' },
    { name: 'Green' as HSLName,  bg: 'hsl(138,62%,40%)' },
    { name: 'Cyan' as HSLName,   bg: 'hsl(195,78%,44%)' },
    { name: 'Blue' as HSLName,   bg: 'hsl(228,72%,52%)' },
  ]

  const activeHSLName = HSL_NAMES[activeHSL]
  
  // Adjust HSL source based on active adjustment layer
  const currentHSL = activeAdjustmentLayer ? activeAdjustmentLayer.hsl : hsl
  const activeHSLData = currentHSL[activeHSLName]

  function hslSliderChange(prop: 'h' | 's' | 'l', e: React.ChangeEvent<HTMLInputElement>) {
    const v = parseInt(e.target.value)
    setHSLChannel(activeHSLName, prop, v)
  }

  function hslFp(v: number, min: number, max: number) {
    return ((v - min) / (max - min) * 100).toFixed(2) + '%'
  }

  return (
    <aside style={{
      width: 'var(--rw)', background: 'var(--s1)',
      borderLeft: '1px solid var(--b1)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
    }}>
      {/* Histogram */}
      <div style={{ padding: 12, borderBottom: '1px solid var(--b1)', flexShrink: 0 }}>
        <canvas
          id="lumio-histogram"
          style={{ width: '100%', height: 50, display: 'block', borderRadius: 6 }}
        />
      </div>

      {/* Active Layer Banner */}
      {activeAdjustmentLayer && (
        <div style={{
          padding: '10px 12px',
          background: 'var(--ag2)',
          borderBottom: '1px solid var(--b1)',
          display: 'flex',
          flexDirection: 'column',
          gap: 6
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--t1)' }}>
              Editing: <span style={{ color: 'var(--a)' }}>{activeAdjustmentLayer.name}</span>
            </span>
            <button
              onClick={() => {
                setActiveAdjustmentLayer(null)
                if (activeTool === 'mask') setActiveTool('select')
              }}
              style={{
                background: 'var(--s3)', border: '1px solid var(--b2)', borderRadius: 4,
                color: 'var(--t1)', fontSize: 10, padding: '2px 8px', cursor: 'pointer',
                fontWeight: 500, transition: 'all var(--fast)'
              }}
            >
              Back to Global
            </button>
          </div>
          
          {/* Mask Brush Controls */}
          {activeTool === 'mask' && (
            <div style={{
              display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
              padding: '8px', background: 'var(--s2)', borderRadius: 'var(--r)',
              border: '1px solid var(--b1)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11 }}>
                <span style={{ color: 'var(--t2)', fontWeight: 500 }}>Mask Brush Options</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', color: isMaskEraser ? 'var(--red)' : 'var(--t2)' }}>
                  <input
                    type="checkbox"
                    checked={isMaskEraser}
                    onChange={e => setIsMaskEraser(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                  <span>Eraser Mode</span>
                </label>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 10.5, color: 'var(--t3)', width: 50 }}>Brush Size</span>
                <input
                  type="range"
                  min={5}
                  max={120}
                  value={maskBrushSize}
                  onChange={e => setMaskBrushSize(parseInt(e.target.value))}
                  style={{ flex: 1, height: 16 }}
                />
                <span style={{ fontSize: 10.5, color: 'var(--t2)', width: 24, textAlign: 'right' }}>{maskBrushSize}px</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Light */}
      <Section
        id="sec-light"
        title="Light"
        onReset={() => { resetSectionKeys(['exposure','brightness','contrast','highlights','shadows','whites','blacks']); if (imageEl) pushHistory('Reset Light') }}
      >
        <Slider label="Exposure"   adjKey="exposure"   min={-100} max={100} />
        <Slider label="Brightness" adjKey="brightness" min={-100} max={100} />
        <Slider label="Contrast"   adjKey="contrast"   min={-100} max={100} />
        <Slider label="Highlights" adjKey="highlights" min={-100} max={100} />
        <Slider label="Shadows"    adjKey="shadows"    min={-100} max={100} />
        <Slider label="Whites"     adjKey="whites"     min={-100} max={100} />
        <Slider label="Blacks"     adjKey="blacks"     min={-100} max={100} />
      </Section>

      {/* Color */}
      <Section
        id="sec-color"
        title="Color"
        onReset={() => { resetSectionKeys(['temperature','tint','saturation','vibrance','hue']); if (imageEl) pushHistory('Reset Color') }}
      >
        <Slider label="Temperature" adjKey="temperature" min={-100} max={100} />
        <Slider label="Tint"        adjKey="tint"        min={-100} max={100} />
        <Slider label="Saturation"  adjKey="saturation"  min={-100} max={100} />
        <Slider label="Vibrance"    adjKey="vibrance"    min={-100} max={100} />
        <Slider label="Hue shift"   adjKey="hue"         min={-180} max={180} />
      </Section>

      {/* HSL */}
      <Section id="sec-hsl" title="HSL / Color Mix">
        {/* Color swatches */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
          {HSL_COLORS.map((c, i) => (
            <div
              key={c.name}
              onClick={() => setActiveHSL(i)}
              title={c.name}
              style={{
                flex: 1, height: 20, borderRadius: 5, cursor: 'pointer',
                background: c.bg,
                border: `2px solid ${i === activeHSL ? '#fff' : 'transparent'}`,
                boxShadow: i === activeHSL ? '0 0 8px rgba(255,255,255,0.3)' : 'none',
                transition: 'transform var(--fast), border-color var(--fast)',
                transform: 'scaleY(1)',
              }}
              onMouseEnter={e => (e.currentTarget.style.transform = 'scaleY(1.25)')}
              onMouseLeave={e => (e.currentTarget.style.transform = 'scaleY(1)')}
            />
          ))}
        </div>
        {/* HSL sliders for active color */}
        {(['h', 's', 'l'] as const).map(prop => {
          const min = prop === 'h' ? -60 : -100
          const max = prop === 'h' ? 60 : 100
          const v = activeHSLData[prop]
          const fp = hslFp(v, min, max)
          return (
            <div key={prop} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span style={{ fontSize: 11.5, color: 'var(--t2)', width: 80, flexShrink: 0 }}>
                {prop === 'h' ? 'Hue' : prop === 's' ? 'Saturation' : 'Luminance'}
              </span>
              <input
                type="range"
                className="lumio-slider"
                min={min}
                max={max}
                value={v}
                onChange={e => hslSliderChange(prop, e)}
                style={{ '--fp': fp } as React.CSSProperties}
              />
              <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {v}
              </span>
            </div>
          )
        })}
      </Section>

      {/* Curves */}
      <Section
        id="sec-curves"
        title="Curves"
        onReset={() => {
          setCurvesChannel('rgb', [{ x: 0, y: 0 }, { x: 255, y: 255 }])
          setCurvesChannel('red', [{ x: 0, y: 0 }, { x: 255, y: 255 }])
          setCurvesChannel('green', [{ x: 0, y: 0 }, { x: 255, y: 255 }])
          setCurvesChannel('blue', [{ x: 0, y: 0 }, { x: 255, y: 255 }])
          if (imageEl) pushHistory('Reset Curves')
        }}
      >
        {/* Channel picker */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['rgb', 'red', 'green', 'blue'] as const).map(ch => (
            <button
              key={ch}
              onClick={() => setCurveChannel(ch)}
              style={{
                flex: 1,
                padding: '4px 0',
                borderRadius: 4,
                border: '1px solid transparent',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: curveChannel === ch ? 'var(--s3)' : 'transparent',
                borderColor: curveChannel === ch ? 'var(--b2)' : 'transparent',
                color: curveChannel === ch
                  ? ch === 'rgb' ? 'var(--t1)' : ch === 'red' ? 'var(--red)' : ch === 'green' ? 'var(--green)' : 'var(--a2)'
                  : 'var(--t2)',
                transition: 'all var(--fast)',
              }}
            >
              {ch}
            </button>
          ))}
        </div>

        {/* SVG Curve Editor */}
        <div style={{ position: 'relative', width: '100%', aspectRatio: '1', background: 'var(--s0)', border: '1px solid var(--b2)', borderRadius: 6, overflow: 'hidden' }}>
          <svg
            width="100%"
            height="100%"
            viewBox="0 0 256 256"
            onMouseDown={e => {
              const rect = e.currentTarget.getBoundingClientRect()
              const x = Math.round(((e.clientX - rect.left) / rect.width) * 255)
              const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)

              const pts = curves[curveChannel] || [{ x: 0, y: 0 }, { x: 255, y: 255 }]
              const threshold = 12
              const index = pts.findIndex(p => Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold)

              if (index !== -1) {
                setDraggedPointIndex(index)
              } else {
                const newPoints = [...pts, { x, y }].sort((a, b) => a.x - b.x)
                const newIndex = newPoints.findIndex(p => p.x === x && p.y === y)
                setCurvesChannel(curveChannel, newPoints)
                setDraggedPointIndex(newIndex)
              }
            }}
            onMouseMove={e => {
              if (draggedPointIndex === null) return
              const rect = e.currentTarget.getBoundingClientRect()
              let x = Math.round(((e.clientX - rect.left) / rect.width) * 255)
              let y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 255)

              x = Math.max(0, Math.min(255, x))
              y = Math.max(0, Math.min(255, y))

              const pts = curves[curveChannel] || [{ x: 0, y: 0 }, { x: 255, y: 255 }]
              const newPoints = [...pts]

              if (draggedPointIndex === 0) {
                x = 0
              } else if (draggedPointIndex === pts.length - 1) {
                x = 255
              } else {
                const prevX = pts[draggedPointIndex - 1].x
                const nextX = pts[draggedPointIndex + 1].x
                x = Math.max(prevX + 1, Math.min(nextX - 1, x))
              }

              newPoints[draggedPointIndex] = { x, y }
              setCurvesChannel(curveChannel, newPoints)
            }}
            onMouseUp={() => {
              if (draggedPointIndex !== null) {
                setDraggedPointIndex(null)
                pushHistory(`Adjust ${curveChannel.toUpperCase()} Curve`)
              }
            }}
            onMouseLeave={() => {
              if (draggedPointIndex !== null) {
                setDraggedPointIndex(null)
                pushHistory(`Adjust ${curveChannel.toUpperCase()} Curve`)
              }
            }}
            style={{ display: 'block', touchAction: 'none' }}
          >
            {/* Grid */}
            <line x1="64" y1="0" x2="64" y2="256" stroke="var(--b1)" strokeWidth="1" />
            <line x1="128" y1="0" x2="128" y2="256" stroke="var(--b1)" strokeWidth="1" />
            <line x1="192" y1="0" x2="192" y2="256" stroke="var(--b1)" strokeWidth="1" />
            <line x1="0" y1="64" x2="256" y2="64" stroke="var(--b1)" strokeWidth="1" />
            <line x1="0" y1="128" x2="256" y2="128" stroke="var(--b1)" strokeWidth="1" />
            <line x1="0" y1="192" x2="256" y2="192" stroke="var(--b1)" strokeWidth="1" />
            <line x1="0" y1="256" x2="256" y2="0" stroke="rgba(255,255,255,0.06)" strokeWidth="1" strokeDasharray="4" />

            {/* Path */}
            <path
              d={(curves[curveChannel] || [{ x: 0, y: 0 }, { x: 255, y: 255 }]).map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${256 - p.y}`).join(' ')}
              fill="none"
              stroke={curveChannel === 'rgb' ? '#fff' : curveChannel === 'red' ? 'var(--red)' : curveChannel === 'green' ? 'var(--green)' : 'var(--a2)'}
              strokeWidth="2"
            />

            {/* Control Points */}
            {(curves[curveChannel] || [{ x: 0, y: 0 }, { x: 255, y: 255 }]).map((p, i) => (
              <circle
                key={i}
                cx={p.x}
                cy={256 - p.y}
                r={draggedPointIndex === i ? '6' : '4'}
                fill={curveChannel === 'rgb' ? '#fff' : curveChannel === 'red' ? 'var(--red)' : curveChannel === 'green' ? 'var(--green)' : 'var(--a2)'}
                stroke="var(--s1)"
                strokeWidth="1.5"
                style={{ cursor: 'pointer' }}
                onDoubleClick={e => {
                  e.stopPropagation()
                  if (i === 0 || i === (curves[curveChannel] || []).length - 1) return
                  const pts = curves[curveChannel] || []
                  const newPoints = pts.filter((_, idx) => idx !== i)
                  setCurvesChannel(curveChannel, newPoints)
                  pushHistory(`Delete Curve Point`)
                }}
              />
            ))}
          </svg>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--t3)', marginTop: 4 }}>
          <span>Shadows</span>
          <span>Highlights</span>
        </div>
      </Section>

      {/* Color Grading */}
      <Section
        id="sec-grading"
        title="Color Grading"
        onReset={() => {
          setColorGradingChannel('shadows', 'h', 0)
          setColorGradingChannel('shadows', 's', 0)
          setColorGradingChannel('shadows', 'l', 0)
          setColorGradingChannel('midtones', 'h', 0)
          setColorGradingChannel('midtones', 's', 0)
          setColorGradingChannel('midtones', 'l', 0)
          setColorGradingChannel('highlights', 'h', 0)
          setColorGradingChannel('highlights', 's', 0)
          setColorGradingChannel('highlights', 'l', 0)
          if (imageEl) pushHistory('Reset Color Grading')
        }}
      >
        {/* Grading tab picker */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
          {(['shadows', 'midtones', 'highlights'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setGradingTab(tab)}
              style={{
                flex: 1,
                padding: '4px 0',
                borderRadius: 4,
                border: '1px solid transparent',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                cursor: 'pointer',
                background: gradingTab === tab ? 'var(--s3)' : 'transparent',
                borderColor: gradingTab === tab ? 'var(--b2)' : 'transparent',
                color: gradingTab === tab ? 'var(--t1)' : 'var(--t2)',
                transition: 'all var(--fast)',
              }}
            >
              {tab}
            </button>
          ))}
        </div>

        <ColorGradingWheel
          label={gradingTab.toUpperCase()}
          value={colorGrading[gradingTab]}
          onChange={(prop, val) => setColorGradingChannel(gradingTab, prop, val)}
          onReset={() => {
            setColorGradingChannel(gradingTab, 'h', 0)
            setColorGradingChannel(gradingTab, 's', 0)
            setColorGradingChannel(gradingTab, 'l', 0)
            pushHistory(`Reset Color Grading (${gradingTab})`)
          }}
        />
      </Section>

      {/* Detail */}
      <Section
        id="sec-detail"
        title="Detail"
        onReset={() => { resetSectionKeys(['sharpness','clarity','dehaze','noise']); if (imageEl) pushHistory('Reset Detail') }}
      >
        <Slider label="Sharpness" adjKey="sharpness" min={0}    max={100} />
        <Slider label="Clarity"   adjKey="clarity"   min={-100} max={100} />
        <Slider label="Dehaze"    adjKey="dehaze"    min={-100} max={100} />
        <Slider label="Noise red." adjKey="noise"   min={0}    max={100} />
      </Section>

      {/* Effects */}
      <Section
        id="sec-effects"
        title="Effects"
        onReset={() => { resetSectionKeys(['vignette','grain','fade','glow']); if (imageEl) pushHistory('Reset Effects') }}
      >
        <Slider label="Vignette" adjKey="vignette" min={-100} max={0} />
        <Slider label="Grain"    adjKey="grain"    min={0}    max={100} />
        <Slider label="Fade"     adjKey="fade"     min={0}    max={100} />
        <Slider label="Glow"     adjKey="glow"     min={0}    max={100} />
      </Section>

      {/* Presets */}
      <Section id="sec-presets" title="Presets">
        <PresetGrid />
      </Section>

      {/* Text Layers Panel */}
      {(textLayers.length > 0 || useEditorStore.getState().activeTool === 'text') && (
        <Section id="sec-text" title="Text Layers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {textLayers.map((layer) => {
              const isSelected = activeTextLayerId === layer.id
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveTextLayer(layer.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 'var(--r)',
                    background: isSelected ? 'var(--s3)' : 'var(--s2)',
                    border: `1px solid ${isSelected ? 'var(--a)' : 'var(--b1)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--t1)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 140 }}>
                    {layer.text}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeTextLayer(layer.id)
                      pushHistory('Delete Text Layer')
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--t3)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                  >
                    Delete
                  </button>
                </div>
              )
            })}

            {/* Selected Text Layer Details */}
            {activeTextLayerId && (() => {
              const layer = textLayers.find(l => l.id === activeTextLayerId)
              if (!layer) return null
              return (
                <div style={{ borderTop: '1px solid var(--b2)', paddingTop: 10, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>Layer Properties</div>
                  
                  {/* Text Edit */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 11, color: 'var(--t3)' }}>Text Content</span>
                    <input
                      type="text"
                      value={layer.text}
                      onChange={(e) => updateTextLayer(layer.id, { text: e.target.value })}
                      style={{
                        height: 28, background: 'var(--s2)',
                        border: '1px solid var(--b1)', borderRadius: 'var(--r)',
                        padding: '0 8px', fontSize: 12, color: 'var(--t1)',
                        outline: 'none',
                      }}
                    />
                  </div>

                  {/* Font Size */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--t2)', width: 80, flexShrink: 0 }}>Font Size</span>
                    <input
                      type="range"
                      min={10}
                      max={120}
                      value={layer.fontSize}
                      onChange={(e) => updateTextLayer(layer.id, { fontSize: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right' }}>{layer.fontSize}px</span>
                  </div>

                  {/* Opacity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--t2)', width: 80, flexShrink: 0 }}>Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={layer.opacity}
                      onChange={(e) => updateTextLayer(layer.id, { opacity: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right' }}>{layer.opacity}%</span>
                  </div>

                  {/* Style & Color */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>Bold</span>
                      <input
                        type="checkbox"
                        checked={layer.fontWeight === 'bold'}
                        onChange={(e) => updateTextLayer(layer.id, { fontWeight: e.target.checked ? 'bold' : 'normal' })}
                      />
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>Color</span>
                      <input
                        type="color"
                        value={layer.color}
                        onChange={(e) => updateTextLayer(layer.id, { color: e.target.value })}
                        style={{ width: 30, height: 20, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                      />
                    </div>
                  </div>
                </div>
              )
            })()}
          </div>
        </Section>
      )}

      {/* Shape Layers Panel */}
      {(shapeLayers.length > 0 || useEditorStore.getState().activeTool === 'rect' || useEditorStore.getState().activeTool === 'circle') && (
        <Section id="sec-shapes" title="Shape Layers">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {shapeLayers.map((layer) => {
              const isSelected = activeShapeLayerId === layer.id
              return (
                <div
                  key={layer.id}
                  onClick={() => setActiveShapeLayer(layer.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '6px 10px',
                    borderRadius: 'var(--r)',
                    background: isSelected ? 'var(--s3)' : 'var(--s2)',
                    border: `1px solid ${isSelected ? 'var(--a)' : 'var(--b1)'}`,
                    cursor: 'pointer',
                  }}
                >
                  <span style={{ fontSize: 12, color: 'var(--t1)', textTransform: 'capitalize' }}>
                    {layer.type === 'rect' ? 'Rectangle' : 'Circle'} Layer
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      removeShapeLayer(layer.id)
                      pushHistory('Delete Shape Layer')
                    }}
                    style={{
                      background: 'none',
                      border: 'none',
                      color: 'var(--t3)',
                      cursor: 'pointer',
                      fontSize: 12,
                    }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--red)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--t3)'}
                  >
                    Delete
                  </button>
                </div>
              )
            })}

            {/* Selected Shape Layer Details */}
            {activeShapeLayerId && (() => {
              const layer = shapeLayers.find(l => l.id === activeShapeLayerId)
              if (!layer) return null
              return (
                <div style={{ borderTop: '1px solid var(--b2)', paddingTop: 10, marginTop: 5, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--t2)' }}>Shape Properties</div>
                  
                  {/* Fill Color */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>Fill Color</span>
                    <input
                      type="color"
                      value={layer.fill.startsWith('rgba') ? '#7c6fff' : layer.fill}
                      onChange={(e) => updateShapeLayer(layer.id, { fill: e.target.value })}
                      style={{ width: 30, height: 20, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Stroke Color */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 11.5, color: 'var(--t2)' }}>Stroke Color</span>
                    <input
                      type="color"
                      value={layer.stroke}
                      onChange={(e) => updateShapeLayer(layer.id, { stroke: e.target.value })}
                      style={{ width: 30, height: 20, padding: 0, border: 'none', background: 'none', cursor: 'pointer' }}
                    />
                  </div>

                  {/* Border Width */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--t2)', width: 80, flexShrink: 0 }}>Border</span>
                    <input
                      type="range"
                      min={0}
                      max={20}
                      value={layer.strokeWidth}
                      onChange={(e) => updateShapeLayer(layer.id, { strokeWidth: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right' }}>{layer.strokeWidth}px</span>
                  </div>

                  {/* Opacity */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: 'var(--t2)', width: 80, flexShrink: 0 }}>Opacity</span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={layer.opacity}
                      onChange={(e) => updateShapeLayer(layer.id, { opacity: parseInt(e.target.value) })}
                      style={{ width: '100%' }}
                    />
                    <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right' }}>{layer.opacity}%</span>
                  </div>
                </div>
              )
            })()}
          </div>
        </Section>
      )}

      {/* Export */}
      <Section id="sec-export" title="Export">
        {/* Format picker */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 5, marginBottom: 10 }}>
          {(['jpeg', 'png', 'webp'] as const).map(fmt => (
            <motion.div
              key={fmt}
              whileHover={{ borderColor: 'var(--b2)' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setExportFormat(fmt)}
              style={{
                background: exportFormat === fmt ? 'var(--ag2)' : 'var(--s3)',
                border: `1px solid ${exportFormat === fmt ? 'var(--a)' : 'var(--b1)'}`,
                borderRadius: 'var(--r)', padding: 7, cursor: 'pointer', textAlign: 'center',
                transition: 'all var(--fast)',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--t1)' }}>{fmt.toUpperCase()}</div>
              <div style={{ fontSize: 9, color: 'var(--t3)', marginTop: 1 }}>
                {fmt === 'jpeg' ? 'Smaller file' : fmt === 'png' ? 'Lossless' : 'Best ratio'}
              </div>
            </motion.div>
          ))}
        </div>

        {/* Quality */}
        {exportFormat !== 'png' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <span style={{ fontSize: 11.5, color: 'var(--t2)', whiteSpace: 'nowrap' }}>Quality</span>
            <input
              type="range"
              className="lumio-slider"
              min={60}
              max={100}
              value={exportQuality}
              onChange={e => setExportQuality(parseInt(e.target.value))}
              style={{ '--fp': ((exportQuality - 60) / 40 * 100).toFixed(2) + '%' } as React.CSSProperties}
            />
            <span style={{ fontSize: 11, color: 'var(--t2)', width: 36, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {exportQuality}%
            </span>
          </div>
        )}

        {/* Export button */}
        <motion.button
          whileHover={{ filter: 'brightness(1.08)' }}
          whileTap={{ scale: 0.97 }}
          onClick={doExport}
          style={{
            width: '100%', height: 34,
            background: 'linear-gradient(130deg, var(--a), var(--rose))',
            color: '#fff', border: 'none', borderRadius: 'var(--r)',
            font: `600 13px var(--body)`, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            boxShadow: '0 4px 18px rgba(124,111,255,.28)',
          }}
        >
          <Download size={13} strokeWidth={2} />
          Download image
        </motion.button>
      </Section>
    </aside>
  )
}

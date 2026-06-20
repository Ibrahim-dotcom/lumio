import React, {
  useRef, useEffect, useCallback, useState
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditorStore } from '../../store/editorStore'
import { pixelPipeline, drawHistogram } from '../../engine/pixelPipeline'
import { ZoomIn, ZoomOut, Maximize2, Columns2, ImageIcon, RotateCcw, RotateCw, Check, X } from 'lucide-react'
import * as api from '../../services/api'

// Exported ref so RightPanel can access histogram canvas
export let histCanvasRef: React.RefObject<HTMLCanvasElement | null> | null = null

export function Canvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const histRef = useRef<HTMLCanvasElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const [comparing, setComparing] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  histCanvasRef = histRef

  const imageEl = useEditorStore(s => s.imageEl)
  const imageName = useEditorStore(s => s.imageName)
  const imageSize = useEditorStore(s => s.imageSize)
  const swapImage = useEditorStore(s => s.swapImage)
  const activeTool = useEditorStore(s => s.activeTool)
  const setActiveTool = useEditorStore(s => s.setActiveTool)
  const adjustments = useEditorStore(s => s.adjustments)
  const zoom = useEditorStore(s => s.zoom)
  const setZoom = useEditorStore(s => s.setZoom)
  const deltaZoom = useEditorStore(s => s.deltaZoom)
  const setImage = useEditorStore(s => s.setImage)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const showToast = useEditorStore(s => s.showToast)
  const isProcessing = useEditorStore(s => s.isProcessing)
  const processingMessage = useEditorStore(s => s.processingMessage)
  const processingSubMessage = useEditorStore(s => s.processingSubMessage)
  const processingStep = useEditorStore(s => s.processingStep)
  const toast = useEditorStore(s => s.toast)
  const history = useEditorStore(s => s.history)

  const [cropBox, setCropBox] = useState<CropBox>({
    x: 0.1, y: 0.1, w: 0.8, h: 0.8
  })

  const handleConfirmCrop = useCallback(() => {
    if (!imageEl) return
    const W = imageEl.naturalWidth
    const H = imageEl.naturalHeight
    const px = Math.round(cropBox.x * W)
    const py = Math.round(cropBox.y * H)
    const pw = Math.round(cropBox.w * W)
    const ph = Math.round(cropBox.h * H)

    if (pw < 10 || ph < 10) return

    const cropCanvas = document.createElement('canvas')
    cropCanvas.width = pw
    cropCanvas.height = ph
    const cropCtx = cropCanvas.getContext('2d')!
    cropCtx.drawImage(imageEl, px, py, pw, ph, 0, 0, pw, ph)

    const croppedUrl = cropCanvas.toDataURL('image/png')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      swapImage(img, imageName, imageSize)
      pushHistory('Crop Photo')
      setActiveTool('select')
      showToast('Photo cropped')
    }
    img.src = croppedUrl
  }, [imageEl, cropBox, swapImage, imageName, imageSize, pushHistory, setActiveTool, showToast])

  const handleRotate = useCallback((clockwise: boolean) => {
    if (!imageEl) return
    const W = imageEl.naturalWidth
    const H = imageEl.naturalHeight

    const rotCanvas = document.createElement('canvas')
    rotCanvas.width = H
    rotCanvas.height = W
    const rotCtx = rotCanvas.getContext('2d')!
    rotCtx.translate(H / 2, W / 2)
    rotCtx.rotate((clockwise ? 90 : -90) * Math.PI / 180)
    rotCtx.drawImage(imageEl, -W / 2, -H / 2)

    const rotatedUrl = rotCanvas.toDataURL('image/png')
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      swapImage(img, imageName, imageSize)
      pushHistory(`Rotate ${clockwise ? '90° CW' : '90° CCW'}`)
      showToast(`Rotated ${clockwise ? 'clockwise' : 'counter-clockwise'}`)
    }
    img.src = rotatedUrl
  }, [imageEl, swapImage, imageName, imageSize, pushHistory, showToast])

  const backendImageId = useEditorStore(s => s.backendImageId)
  const projectId = useEditorStore(s => s.projectId)
  const setBackendIds = useEditorStore(s => s.setBackendIds)

  const [brushSize, setBrushSize] = useState(20)
  const [isBrushing, setIsBrushing] = useState(false)
  const [isHealing, setIsHealing] = useState(false)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)

  // Keep overlay canvas size in sync with target canvas
  useEffect(() => {
    if (activeTool === 'heal' && overlayCanvasRef.current && canvasRef.current) {
      overlayCanvasRef.current.width = canvasRef.current.width
      overlayCanvasRef.current.height = canvasRef.current.height
    }
  }, [activeTool, imageEl])

  const handleHealRequest = useCallback(async (points: [number, number, number][]) => {
    if (!imageEl) return
    setIsHealing(true)
    showToast('Healing spot...')

    let activeImageId = backendImageId
    let activeProjectId = projectId

    // Auto-sync if not synced yet
    if (!activeImageId) {
      showToast('Syncing image with server...')
      try {
        const blob = await new Promise<Blob>((resolve, reject) => {
          const canvas = document.createElement('canvas')
          canvas.width = imageEl.naturalWidth || imageEl.width
          canvas.height = imageEl.naturalHeight || imageEl.height
          canvas.getContext('2d')!.drawImage(imageEl, 0, 0)
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('blob null')), 'image/png')
        })
        const file = new File([blob], imageName || 'canvas-export.png', { type: 'image/png' })
        if (!activeProjectId) {
          const project = await api.createProject(imageName?.replace(/\.[^/.]+$/, '') || 'Untitled')
          activeProjectId = project.id
        }
        const uploaded = await api.uploadImage(activeProjectId, file)
        activeImageId = uploaded.id
        setBackendIds(activeProjectId, activeImageId)
      } catch (err) {
        showToast('Failed to sync image with server', true)
        setIsHealing(false)
        const canvas = overlayCanvasRef.current
        if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
    }

    try {
      void await api.healImage(activeImageId, points)
      const deadline = Date.now() + 60000
      while (Date.now() < deadline) {
        await new Promise(r => setTimeout(r, 1500))
        const status = await api.getTaskStatus(activeImageId)
        if (status.processed_file) {
          const backendRoot = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
          const url = status.processed_file.startsWith('http')
            ? status.processed_file
            : `${backendRoot}${status.processed_file}`

          const img = new Image()
          img.crossOrigin = 'anonymous'
          img.onload = () => {
            swapImage(img, imageName, imageSize)
            pushHistory('Spot Heal')
            showToast('Healed spot!')
            setIsHealing(false)
            const canvas = overlayCanvasRef.current
            if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
          }
          img.src = url
          return
        }
      }
      throw new Error('Spot healing timed out')
    } catch (err) {
      showToast('Healing failed', true)
      setIsHealing(false)
      const canvas = overlayCanvasRef.current
      if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [imageEl, backendImageId, projectId, swapImage, imageName, imageSize, pushHistory, showToast, setBackendIds])

  const handleHealMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageEl || !overlayCanvasRef.current) return
    setIsBrushing(true)
    const canvas = overlayCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const W = imageEl.naturalWidth
    const H = imageEl.naturalHeight

    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const px = (clientX / rect.width) * W
    const py = (clientY / rect.height) * H
    const pr = (brushSize / rect.width) * W

    const ctx = canvas.getContext('2d')!
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(255, 60, 100, 0.45)'
    ctx.lineWidth = brushSize * 2
    ctx.beginPath()
    ctx.moveTo(clientX, clientY)

    const newStrokes: [number, number, number][] = [[px, py, pr]]

    function handleMouseMove(ev: MouseEvent) {
      const cX = ev.clientX - rect.left
      const cY = ev.clientY - rect.top
      const ipx = (cX / rect.width) * W
      const ipy = (cY / rect.height) * H

      ctx.lineTo(cX, cY)
      ctx.stroke()

      newStrokes.push([ipx, ipy, pr])
    }

    function handleMouseUp() {
      setIsBrushing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      handleHealRequest(newStrokes)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [imageEl, brushSize, handleHealRequest])

  const handleOverlayMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isBrushing || !overlayCanvasRef.current) return
    const canvas = overlayCanvasRef.current
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top

    ctx.beginPath()
    ctx.arc(clientX, clientY, brushSize, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()
  }, [isBrushing, brushSize])

  // ─── Render engine ──────────────────────────────────────────────────────────
  const renderCanvas = useCallback(() => {
    if (!imageEl || !canvasRef.current || !stageRef.current) return
    const cv = canvasRef.current
    const stage = stageRef.current
    const originalImg = comparing ? (history[0]?.imageEl || imageEl) : imageEl
    const maxW = stage.clientWidth - 80
    const maxH = stage.clientHeight - 60
    const sc = Math.min(maxW / originalImg.naturalWidth, maxH / originalImg.naturalHeight, 1)
    const W = originalImg.naturalWidth, H = originalImg.naturalHeight
    cv.width = W; cv.height = H
    cv.style.width = Math.round(W * sc * zoom) + 'px'
    cv.style.height = Math.round(H * sc * zoom) + 'px'

    const ctx = cv.getContext('2d', { willReadFrequently: true })!
    ctx.drawImage(originalImg, 0, 0)

    if (!comparing) {
      pixelPipeline(ctx, W, H, adjustments)
    }

    if (histRef.current) {
      drawHistogram(ctx, W, H, histRef.current)
    }
  }, [imageEl, adjustments, zoom, comparing, history])

  const schedRender = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      renderCanvas()
    })
  }, [renderCanvas])

  useEffect(() => {
    schedRender()
    return () => { if (rafRef.current !== null) cancelAnimationFrame(rafRef.current) }
  }, [schedRender])

  // ─── File drop on stage ──────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) {
      showToast('Please upload an image file', true)
      return
    }
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      setImage(img, file.name, file.size)
      pushHistory('Original')
      showToast('Photo loaded — describe an edit below ✦')
    }
    img.onerror = () => showToast('Could not load this image', true)
    img.src = url
  }, [setImage, pushHistory, showToast])

  function handleStageDragOver(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(true)
  }
  function handleStageDragLeave() { setIsDragging(false) }
  function handleStageDrop(e: React.DragEvent) {
    e.preventDefault()
    setIsDragging(false)
    const f = e.dataTransfer?.files?.[0]
    if (f) loadFile(f)
  }

  // ─── Compare ─────────────────────────────────────────────────────────────────
  function startCompare() {
    if (!imageEl || !canvasRef.current) return
    setComparing(true)
    const ctx = canvasRef.current.getContext('2d')!
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
    const originalImg = history[0]?.imageEl || imageEl
    ctx.drawImage(originalImg, 0, 0)
  }
  function endCompare() {
    if (comparing) { setComparing(false); schedRender() }
  }

  // ─── Ctrl+Wheel zoom ─────────────────────────────────────────────────────────
  useEffect(() => {
    const el = stageRef.current
    if (!el) return
    const handler = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault()
        deltaZoom(-e.deltaY * 0.003)
      }
    }
    el.addEventListener('wheel', handler, { passive: false })
    return () => el.removeEventListener('wheel', handler)
  }, [deltaZoom])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────────
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space' && imageEl) { e.preventDefault(); startCompare() }
    }
    function handleKeyUp(e: KeyboardEvent) {
      if (e.code === 'Space') endCompare()
    }
    window.addEventListener('keydown', handleKey)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      window.removeEventListener('keydown', handleKey)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [imageEl, comparing])

  // ─── Clipboard paste ──────────────────────────────────────────────────────────
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const item = e.clipboardData?.items?.[0]
      if (item?.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) loadFile(f)
      }
    }
    document.addEventListener('paste', handlePaste)
    return () => document.removeEventListener('paste', handlePaste)
  }, [loadFile])

  const zoomPct = Math.round(zoom * 100)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
      {/* Stage */}
      <div
        ref={stageRef}
        onDragOver={handleStageDragOver}
        onDragLeave={handleStageDragLeave}
        onDrop={handleStageDrop}
        style={{
          flex: 1,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', position: 'relative',
          background: 'var(--s0)',
          outline: isDragging ? '2px dashed var(--a)' : 'none',
          outlineOffset: isDragging ? -3 : 0,
        }}
      >
        {/* Grid */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          backgroundImage: 'linear-gradient(var(--b1) 1px, transparent 1px), linear-gradient(90deg, var(--b1) 1px, transparent 1px)',
          backgroundSize: '44px 44px',
        }} />

        {/* Radial bloom */}
        <div style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
          background: 'radial-gradient(ellipse 60% 55% at 50% 50%, rgba(124,111,255,0.045) 0%, transparent 70%)',
        }} />

        {/* Empty state */}
        <AnimatePresence>
          {!imageEl && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 2,
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
              }}
            >
              <ImageIcon size={56} color="var(--t3)" strokeWidth={0.8} style={{ opacity: 0.35 }} />
              <div style={{ fontFamily: 'var(--display)', fontSize: 22, fontWeight: 600, color: 'var(--t1)', textAlign: 'center' }}>
                Drop a photo to begin
              </div>
              <div style={{ fontSize: 13, color: 'var(--t2)', textAlign: 'center', lineHeight: 1.65 }}>
                Or paste from clipboard with{' '}
                <span style={{ display: 'inline', background: 'var(--s4)', border: '1px solid var(--b2)', borderRadius: 4, padding: '1px 6px', fontSize: 11, color: 'var(--t2)' }}>
                  Ctrl+V
                </span>
                <br />Supports JPEG · PNG · WebP · HEIC
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, width: 180 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--b2)' }} />
                <span style={{ fontSize: 11, color: 'var(--t3)' }}>or</span>
                <div style={{ flex: 1, height: 1, background: 'var(--b2)' }} />
              </div>
              <label style={{
                padding: '9px 24px', background: 'var(--a)', color: '#fff',
                border: 'none', borderRadius: 'var(--r)', font: `500 13px var(--body)`,
                cursor: 'pointer', position: 'relative',
              }}>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f) }}
                  style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
                />
                Browse files
              </label>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Canvas */}
        <div style={{ position: 'relative', zIndex: 1, display: imageEl ? 'block' : 'none' }}>
          <canvas
            ref={canvasRef}
            style={{ display: 'block', borderRadius: 3, boxShadow: '0 0 0 1px var(--b2), 0 24px 72px rgba(0,0,0,0.75)' }}
          />
          {activeTool === 'crop' && (
            <CropOverlay
              crop={cropBox}
              onChange={setCropBox}
              onConfirm={handleConfirmCrop}
              onCancel={() => setActiveTool('select')}
              onRotateCW={() => handleRotate(true)}
              onRotateCCW={() => handleRotate(false)}
            />
          )}
          {activeTool === 'heal' && (
            <canvas
              ref={overlayCanvasRef}
              onMouseDown={handleHealMouseDown}
              onMouseMove={handleOverlayMouseMove}
              style={{
                position: 'absolute', inset: 0, zIndex: 10,
                cursor: isHealing ? 'wait' : 'crosshair',
                pointerEvents: isHealing ? 'none' : 'auto',
                width: '100%', height: '100%',
              }}
            />
          )}
          {comparing && (
            <div style={{
              position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50%)',
              background: 'rgba(0,0,0,0.7)', border: '1px solid var(--b2)', borderRadius: 20,
              padding: '3px 12px', fontSize: 11, color: 'var(--t2)', whiteSpace: 'nowrap',
            }}>
              Original
            </div>
          )}
        </div>

        {/* Processing overlay */}
        <AnimatePresence>
          {isProcessing && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                position: 'absolute', inset: 0, zIndex: 50,
                background: 'rgba(8,8,12,0.86)',
                backdropFilter: 'blur(8px)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16,
              }}
            >
              <div className="animate-spin-lumio" style={{
                width: 38, height: 38,
                border: '2px solid var(--b2)',
                borderTopColor: 'var(--a)',
                borderRadius: '50%',
              }} />
              <div style={{ fontFamily: 'var(--display)', fontSize: 15, fontWeight: 600, color: 'var(--t1)' }}>
                {processingMessage}
              </div>
              <div style={{ fontSize: 12, color: 'var(--t2)' }}>{processingSubMessage}</div>
              <div style={{ display: 'flex', gap: 7 }}>
                {[0, 1, 2].map(i => (
                  <div key={i} style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: i <= processingStep ? 'var(--a)' : 'var(--s5)',
                    transform: i <= processingStep ? 'scale(1.4)' : 'scale(1)',
                    transition: 'background 0.25s, transform 0.25s',
                  }} />
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Toast */}
        <AnimatePresence>
          {toast && (
            <motion.div
              key={toast.key}
              initial={{ y: -60, x: '-50%', opacity: 0 }}
              animate={{ y: 0, x: '-50%', opacity: 1 }}
              exit={{ y: -60, x: '-50%', opacity: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              style={{
                position: 'absolute', top: 14, left: '50%',
                background: 'var(--s4)', border: '1px solid var(--b2)',
                borderRadius: 'var(--r2)', padding: '8px 14px',
                fontSize: 12.5, color: 'var(--t1)',
                display: 'flex', alignItems: 'center', gap: 8,
                whiteSpace: 'nowrap',
                boxShadow: '0 8px 28px rgba(0,0,0,.55)',
                zIndex: 60,
              }}
            >
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: toast.isError ? 'var(--red)' : 'var(--green)', flexShrink: 0 }} />
              {toast.message}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Brush Size Float Bar */}
        {activeTool === 'heal' && imageEl && (
          <div style={{
            position: 'absolute', bottom: 58, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'var(--s2)', border: '1px solid var(--b2)',
            borderRadius: 'var(--r)', padding: '4px 12px', zIndex: 10,
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
          }}>
            <span style={{ fontSize: 11.5, color: 'var(--t2)', whiteSpace: 'nowrap' }}>Brush size</span>
            <input
              type="range"
              min={5}
              max={60}
              value={brushSize}
              onChange={e => setBrushSize(parseInt(e.target.value))}
              style={{ width: 100 }}
            />
            <span style={{ fontSize: 11, color: 'var(--t2)', width: 28, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
              {brushSize}px
            </span>
          </div>
        )}

        {/* Zoom controls */}
        {imageEl && (
          <div style={{
            position: 'absolute', bottom: 14, left: '50%', transform: 'translateX(-50%)',
            display: 'flex', background: 'var(--s2)', border: '1px solid var(--b2)',
            borderRadius: 'var(--r)', overflow: 'hidden', zIndex: 10,
          }}>
            <FloatBtn onClick={() => deltaZoom(-0.15)} title="Zoom out"><ZoomOut size={13} strokeWidth={2} /></FloatBtn>
            <div style={{ padding: '0 8px', fontSize: 11.5, color: 'var(--t2)', minWidth: 46, textAlign: 'center', borderLeft: '1px solid var(--b1)', borderRight: '1px solid var(--b1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontVariantNumeric: 'tabular-nums' }}>
              {zoomPct}%
            </div>
            <FloatBtn onClick={() => deltaZoom(0.15)} title="Zoom in"><ZoomIn size={13} strokeWidth={2} /></FloatBtn>
            <div style={{ width: 1, background: 'var(--b1)', alignSelf: 'stretch' }} />
            <FloatBtn onClick={() => setZoom(1)} title="Fit to screen"><Maximize2 size={13} strokeWidth={2} /></FloatBtn>
          </div>
        )}

        {/* Compare button */}
        {imageEl && (
          <div style={{
            position: 'absolute', bottom: 14, right: 14,
            display: 'flex', background: 'var(--s2)', border: '1px solid var(--b2)',
            borderRadius: 'var(--r)', overflow: 'hidden', zIndex: 10,
          }}>
            <button
              onMouseDown={startCompare}
              onMouseUp={endCompare}
              onTouchStart={startCompare}
              onTouchEnd={endCompare}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '0 12px', height: 32,
                background: comparing ? 'var(--s4)' : 'none',
                border: 'none', cursor: 'pointer',
                color: 'var(--t2)', fontSize: 12, whiteSpace: 'nowrap',
                transition: 'background var(--fast)',
              }}
            >
              <Columns2 size={13} strokeWidth={2} />
              Hold to compare
            </button>
          </div>
        )}

        {/* Hidden histogram canvas (drawn into by renderCanvas) */}
        <canvas ref={histRef} style={{ display: 'none' }} />
      </div>
    </div>
  )
}

function FloatBtn({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title?: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        width: 32, height: 32, background: 'none', border: 'none',
        color: 'var(--t2)', cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'background var(--fast), color var(--fast)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--s4)'; e.currentTarget.style.color = 'var(--t1)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--t2)' }}
    >
      {children}
    </button>
  )
}

interface CropBox { x: number; y: number; w: number; h: number }

function CropOverlay({
  crop,
  onChange,
  onConfirm,
  onCancel,
  onRotateCW,
  onRotateCCW,
}: {
  crop: CropBox
  onChange: (c: CropBox) => void
  onConfirm: () => void
  onCancel: () => void
  onRotateCW: () => void
  onRotateCCW: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)

  function handleMouseDown(e: React.MouseEvent, type: string) {
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const startCrop = { ...crop }

    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const containerW = rect.width
    const containerH = rect.height

    function handleMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startX) / containerW
      const dy = (ev.clientY - startY) / containerH

      let { x, y, w, h } = startCrop

      if (type === 'move') {
        x = Math.max(0, Math.min(1 - w, x + dx))
        y = Math.max(0, Math.min(1 - h, y + dy))
      } else {
        if (type.includes('w')) {
          const newX = Math.max(0, Math.min(x + w - 0.05, x + dx))
          w = w + (x - newX)
          x = newX
        }
        if (type.includes('e')) {
          w = Math.max(0.05, Math.min(1 - x, w + dx))
        }
        if (type.includes('n')) {
          const newY = Math.max(0, Math.min(y + h - 0.05, y + dy))
          h = h + (y - newY)
          y = newY
        }
        if (type.includes('s')) {
          h = Math.max(0.05, Math.min(1 - y, h + dy))
        }
      }

      onChange({ x, y, w, h })
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  const leftPct = (crop.x * 100).toFixed(2) + '%'
  const topPct = (crop.y * 100).toFixed(2) + '%'
  const widthPct = (crop.w * 100).toFixed(2) + '%'
  const heightPct = (crop.h * 100).toFixed(2) + '%'

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        overflow: 'hidden', cursor: 'default',
        userSelect: 'none',
      }}
    >
      {/* Outer dark overlay mask */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: topPct, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: `calc(100% - ${topPct} - ${heightPct})`, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'absolute', top: topPct, bottom: `calc(100% - ${topPct} - ${heightPct})`, left: 0, width: leftPct, background: 'rgba(0,0,0,0.6)' }} />
      <div style={{ position: 'absolute', top: topPct, bottom: `calc(100% - ${topPct} - ${heightPct})`, right: 0, width: `calc(100% - ${leftPct} - ${widthPct})`, background: 'rgba(0,0,0,0.6)' }} />

      {/* Selected Bounding Box */}
      <div
        style={{
          position: 'absolute',
          left: leftPct,
          top: topPct,
          width: widthPct,
          height: heightPct,
          border: '1.5px solid #fff',
        }}
      >
        <div
          onMouseDown={e => handleMouseDown(e, 'move')}
          style={{ position: 'absolute', inset: 8, cursor: 'move' }}
        />

        {/* Thirds Grid lines */}
        <div style={{ position: 'absolute', left: '33.3%', top: 0, bottom: 0, width: '0.5px', background: 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', left: '66.6%', top: 0, bottom: 0, width: '0.5px', background: 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', top: '33.3%', left: 0, right: 0, height: '0.5px', background: 'rgba(255,255,255,0.35)' }} />
        <div style={{ position: 'absolute', top: '66.6%', left: 0, right: 0, height: '0.5px', background: 'rgba(255,255,255,0.35)' }} />

        {/* Handles */}
        <div
          onMouseDown={e => handleMouseDown(e, 'nw')}
          style={{ position: 'absolute', left: -4, top: -4, width: 14, height: 14, borderLeft: '3px solid #fff', borderTop: '3px solid #fff', cursor: 'nwse-resize', zIndex: 12 }}
        />
        <div
          onMouseDown={e => handleMouseDown(e, 'ne')}
          style={{ position: 'absolute', right: -4, top: -4, width: 14, height: 14, borderRight: '3px solid #fff', borderTop: '3px solid #fff', cursor: 'nesw-resize', zIndex: 12 }}
        />
        <div
          onMouseDown={e => handleMouseDown(e, 'se')}
          style={{ position: 'absolute', right: -4, bottom: -4, width: 14, height: 14, borderRight: '3px solid #fff', borderBottom: '3px solid #fff', cursor: 'nwse-resize', zIndex: 12 }}
        />
        <div
          onMouseDown={e => handleMouseDown(e, 'sw')}
          style={{ position: 'absolute', left: -4, bottom: -4, width: 14, height: 14, borderLeft: '3px solid #fff', borderBottom: '3px solid #fff', cursor: 'nesw-resize', zIndex: 12 }}
        />
      </div>

      {/* Floating Crop Control Bar */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'var(--s2)',
          border: '1px solid var(--b2)',
          borderRadius: 'var(--r2)',
          padding: '6px 12px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 20,
        }}
      >
        <button
          onClick={onRotateCCW}
          title="Rotate Left (90° CCW)"
          style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
        >
          <RotateCcw size={14} />
        </button>
        <button
          onClick={onRotateCW}
          title="Rotate Right (90° CW)"
          style={{ background: 'none', border: 'none', color: 'var(--t2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}
        >
          <RotateCw size={14} />
        </button>
        <div style={{ width: 1, height: 16, background: 'var(--b2)' }} />
        <button
          onClick={onCancel}
          style={{
            background: 'none', border: 'none', color: 'var(--red)',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <X size={14} /> Cancel
        </button>
        <button
          onClick={onConfirm}
          style={{
            background: 'var(--a)', border: 'none', color: '#fff',
            borderRadius: 6, padding: '3px 10px',
            fontWeight: 600, fontSize: 12, cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 4,
          }}
        >
          <Check size={14} /> Apply Crop
        </button>
      </div>
    </div>
  )
}

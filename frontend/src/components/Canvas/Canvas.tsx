import React, {
  useRef, useEffect, useCallback, useState
} from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useEditorStore, type TextLayer, type ShapeLayer } from '../../store/editorStore'
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

  // Text Layers selectors
  const textLayers = useEditorStore(s => s.textLayers)
  const addTextLayer = useEditorStore(s => s.addTextLayer)
  const activeTextLayerId = useEditorStore(s => s.activeTextLayerId)

  // Shape Layers selectors
  const shapeLayers = useEditorStore(s => s.shapeLayers)
  const addShapeLayer = useEditorStore(s => s.addShapeLayer)
  const activeShapeLayerId = useEditorStore(s => s.activeShapeLayerId)

  const [drawingShape, setDrawingShape] = useState<{
    type: 'rect' | 'circle'
    startX: number
    startY: number
    x: number
    y: number
    w: number
    h: number
  } | null>(null)

  const [brushSize, setBrushSize] = useState(20)
  const [isBrushing, setIsBrushing] = useState(false)
  const [isHealing, setIsHealing] = useState(false)
  const [stampSource, setStampSource] = useState<{ x: number; y: number } | null>(null)
  const [isCloning, setIsCloning] = useState(false)
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null)

  // Keep overlay canvas size in sync with target canvas
  useEffect(() => {
    if ((activeTool === 'heal' || activeTool === 'stamp') && overlayCanvasRef.current && canvasRef.current) {
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
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const ctx = canvas.getContext('2d')!
    ctx.clearRect(0, 0, canvas.width, canvas.height)

    ctx.beginPath()
    ctx.arc(clientX, clientY, brushSize, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.2)'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()
  }, [isBrushing, brushSize])

  // ─── Clone Stamp request & mouse events ──────────────────────────────────────
  const handleStampRequest = useCallback(async (srcX: number, srcY: number, strokes: [number, number, number][]) => {
    if (!imageEl) return
    setIsCloning(true)
    showToast('Cloning pixels...')

    let activeImageId = backendImageId
    let activeProjectId = projectId

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
        setIsCloning(false)
        const canvas = overlayCanvasRef.current
        if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
        return
      }
    }

    try {
      void await api.cloneStamp(activeImageId, srcX, srcY, strokes)
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
            pushHistory('Clone Stamp')
            showToast('Cloned pixels!')
            setIsCloning(false)
            const canvas = overlayCanvasRef.current
            if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
          }
          img.src = url
          return
        }
      }
      throw new Error('Clone stamp timed out')
    } catch (err) {
      showToast('Cloning failed', true)
      setIsCloning(false)
      const canvas = overlayCanvasRef.current
      if (canvas) canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    }
  }, [imageEl, backendImageId, projectId, swapImage, imageName, imageSize, pushHistory, showToast, setBackendIds])

  const drawStampOverlay = useCallback((
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    source: { x: number; y: number } | null,
    cursorX: number,
    cursorY: number
  ) => {
    if (!imageEl) return
    ctx.clearRect(0, 0, width, height)

    // Brush outline
    ctx.beginPath()
    ctx.arc(cursorX, cursorY, brushSize, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.1)'
    ctx.strokeStyle = '#fff'
    ctx.lineWidth = 1
    ctx.fill()
    ctx.stroke()

    if (source) {
      const W = imageEl.naturalWidth
      const H = imageEl.naturalHeight
      const srcCX = (source.x / W) * width
      const srcCY = (source.y / H) * height

      // Crosshair
      ctx.beginPath()
      ctx.arc(srcCX, srcCY, 8, 0, Math.PI * 2)
      ctx.moveTo(srcCX - 12, srcCY)
      ctx.lineTo(srcCX + 12, srcCY)
      ctx.moveTo(srcCX, srcCY - 12)
      ctx.lineTo(srcCX, srcCY + 12)
      ctx.strokeStyle = '#00ff66'
      ctx.lineWidth = 1.5
      ctx.stroke()

      ctx.fillStyle = '#00ff66'
      ctx.font = '10px sans-serif'
      ctx.fillText('Source', srcCX + 14, srcCY - 4)

      // Connecting line
      ctx.beginPath()
      ctx.setLineDash([4, 4])
      ctx.moveTo(srcCX, srcCY)
      ctx.lineTo(cursorX, cursorY)
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)'
      ctx.lineWidth = 1
      ctx.stroke()
      ctx.setLineDash([])
    }
  }, [imageEl, brushSize])

  const handleStampMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!imageEl || !overlayCanvasRef.current) return
    const canvas = overlayCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const W = imageEl.naturalWidth
    const H = imageEl.naturalHeight

    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const px = (clientX / rect.width) * W
    const py = (clientY / rect.height) * H

    if (e.altKey) {
      setStampSource({ x: px, y: py })
      showToast(`Source set at: ${Math.round(px)}px, ${Math.round(py)}px`)
      const ctx = canvas.getContext('2d')!
      drawStampOverlay(ctx, rect.width, rect.height, { x: px, y: py }, clientX, clientY)
      return
    }

    if (!stampSource) {
      showToast('Alt + Click to select clone source first!', true)
      return
    }

    setIsBrushing(true)
    const ctx = canvas.getContext('2d')!
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(100, 255, 100, 0.45)'
    ctx.lineWidth = brushSize * 2
    ctx.beginPath()
    ctx.moveTo(clientX, clientY)

    const pr = (brushSize / rect.width) * W
    const newStrokes: [number, number, number][] = [[px, py, pr]]

    function handleMouseMove(ev: MouseEvent) {
      const cX = ev.clientX - rect.left
      const cY = ev.clientY - rect.top
      const ipx = (cX / rect.width) * W
      const ipy = (cY / rect.height) * H

      ctx.lineTo(cX, cY)
      ctx.stroke()
      drawStampOverlay(ctx, rect.width, rect.height, stampSource, cX, cY)

      newStrokes.push([ipx, ipy, pr])
    }

    function handleMouseUp() {
      setIsBrushing(false)
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      if (stampSource) {
        handleStampRequest(stampSource.x, stampSource.y, newStrokes)
      }
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [imageEl, brushSize, stampSource, handleStampRequest, drawStampOverlay, showToast])

  const handleStampMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isBrushing || !overlayCanvasRef.current) return
    const canvas = overlayCanvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const ctx = canvas.getContext('2d')!
    drawStampOverlay(ctx, rect.width, rect.height, stampSource, clientX, clientY)
  }, [isBrushing, stampSource, drawStampOverlay])

  // ─── Text Layer placement click ──────────────────────────────────────────────
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (activeTool !== 'text' || !imageEl || !canvasRef.current) return
    const target = e.target as HTMLElement
    if (target.closest('.lumio-text-layer')) return

    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const rx = clientX / rect.width
    const ry = clientY / rect.height

    const newLayer: TextLayer = {
      id: 'text-' + Date.now(),
      text: 'Double click to edit',
      x: rx,
      y: ry,
      fontSize: 24,
      color: '#ffffff',
      fontWeight: 'normal',
      opacity: 100,
    }

    addTextLayer(newLayer)
    pushHistory('Add Text Layer')
    showToast('Text layer added')
  }, [activeTool, imageEl, addTextLayer, pushHistory, showToast])

  // ─── Shape Layer placement / drag drawing ───────────────────────────────────
  const handleShapeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if ((activeTool !== 'rect' && activeTool !== 'circle') || !imageEl || !canvasRef.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()

    const clientX = e.clientX - rect.left
    const clientY = e.clientY - rect.top
    const startX = clientX / rect.width
    const startY = clientY / rect.height

    setDrawingShape({
      type: activeTool,
      startX,
      startY,
      x: startX,
      y: startY,
      w: 0,
      h: 0,
    })

    function handleMouseMove(ev: MouseEvent) {
      const cX = ev.clientX - rect.left
      const cY = ev.clientY - rect.top
      const currX = Math.max(0, Math.min(1, cX / rect.width))
      const currY = Math.max(0, Math.min(1, cY / rect.height))

      const x = Math.min(startX, currX)
      const y = Math.min(startY, currY)
      const w = Math.abs(startX - currX)
      const h = Math.abs(startY - currY)

      setDrawingShape({
        type: activeTool as 'rect' | 'circle',
        startX,
        startY,
        x,
        y,
        w,
        h
      })
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      
      setDrawingShape(s => {
        if (s && s.w > 0.005 && s.h > 0.005) {
          const newShape: ShapeLayer = {
            id: 'shape-' + Date.now(),
            type: s.type,
            x: s.x,
            y: s.y,
            w: s.w,
            h: s.h,
            fill: 'rgba(124, 111, 255, 0.4)',
            stroke: '#7c6fff',
            strokeWidth: 2,
            opacity: 100,
          }
          addShapeLayer(newShape)
          pushHistory(`Add ${s.type === 'rect' ? 'Rectangle' : 'Circle'}`)
          showToast(`${s.type === 'rect' ? 'Rectangle' : 'Circle'} added`)
        }
        return null
      })
      setActiveTool('select')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }, [activeTool, imageEl, addShapeLayer, pushHistory, showToast, setActiveTool])

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

        {/* Canvas Container */}
        <div 
          onClick={handleCanvasClick}
          onMouseDown={handleShapeMouseDown}
          style={{ position: 'relative', zIndex: 1, display: imageEl ? 'block' : 'none' }}
        >
          <canvas
            ref={canvasRef}
            id="lumio-main-canvas"
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
          {activeTool === 'stamp' && (
            <canvas
              ref={overlayCanvasRef}
              onMouseDown={handleStampMouseDown}
              onMouseMove={handleStampMouseMove}
              style={{
                position: 'absolute', inset: 0, zIndex: 10,
                cursor: isCloning ? 'wait' : 'crosshair',
                pointerEvents: isCloning ? 'none' : 'auto',
                width: '100%', height: '100%',
              }}
            />
          )}
          {/* Text Layer overlays */}
          {textLayers.map((layer) => {
            const isSelected = activeTextLayerId === layer.id
            return (
              <TextLayerComponent
                key={layer.id}
                layer={layer}
                isSelected={isSelected}
                canvasRef={canvasRef}
              />
            )
          })}
          {/* Shape Layer overlays */}
          {shapeLayers.map((layer) => {
            const isSelected = activeShapeLayerId === layer.id
            return (
              <ShapeLayerComponent
                key={layer.id}
                layer={layer}
                isSelected={isSelected}
                canvasRef={canvasRef}
              />
            )
          })}
          {/* Active drawing shape preview */}
          {drawingShape && (
            <div
              style={{
                position: 'absolute',
                left: `${drawingShape.x * 100}%`,
                top: `${drawingShape.y * 100}%`,
                width: `${drawingShape.w * 100}%`,
                height: `${drawingShape.h * 100}%`,
                border: '1.5px dashed var(--a)',
                background: 'rgba(124, 111, 255, 0.25)',
                borderRadius: drawingShape.type === 'circle' ? '50%' : '0',
                pointerEvents: 'none',
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
        {(activeTool === 'heal' || activeTool === 'stamp') && imageEl && (
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

function TextLayerComponent({
  layer,
  isSelected,
  canvasRef,
}: {
  layer: TextLayer
  isSelected: boolean
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const updateTextLayer = useEditorStore(s => s.updateTextLayer)
  const setActiveTextLayer = useEditorStore(s => s.setActiveTextLayer)
  const removeTextLayer = useEditorStore(s => s.removeTextLayer)
  const pushHistory = useEditorStore(s => s.pushHistory)
  const [isEditing, setIsEditing] = useState(false)
  const divRef = useRef<HTMLDivElement>(null)

  const handleMouseDown = (e: React.MouseEvent) => {
    if (isEditing) return
    e.preventDefault()
    setActiveTextLayer(layer.id)

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startXPct = layer.x
    const startYPct = layer.y

    function handleMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startX) / rect.width
      const dy = (ev.clientY - startY) / rect.height
      updateTextLayer(layer.id, {
        x: Math.max(0, Math.min(1, startXPct + dx)),
        y: Math.max(0, Math.min(1, startYPct + dy)),
      })
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      pushHistory('Move Text')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  useEffect(() => {
    if (!isEditing) return
    const handler = (e: MouseEvent) => {
      if (divRef.current && !divRef.current.contains(e.target as Node)) {
        setIsEditing(false)
        if (divRef.current.innerText.trim() === '') {
          removeTextLayer(layer.id)
          pushHistory('Remove Empty Text')
        } else {
          updateTextLayer(layer.id, { text: divRef.current.innerText })
          pushHistory('Update Text Content')
        }
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isEditing, layer.id, removeTextLayer, updateTextLayer, pushHistory])

  return (
    <div
      ref={divRef}
      onMouseDown={handleMouseDown}
      onDoubleClick={() => {
        setIsEditing(true)
        setActiveTextLayer(layer.id)
      }}
      className="lumio-text-layer"
      contentEditable={isEditing}
      suppressContentEditableWarning
      style={{
        position: 'absolute',
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        transform: 'translate(-50%, -50%)',
        fontSize: layer.fontSize,
        color: layer.color,
        fontWeight: layer.fontWeight,
        opacity: layer.opacity / 100,
        cursor: isEditing ? 'text' : 'move',
        userSelect: isEditing ? 'text' : 'none',
        outline: isSelected ? '1px dashed var(--a)' : 'none',
        padding: '4px 8px',
        whiteSpace: 'nowrap',
        zIndex: isSelected ? 20 : 10,
        fontFamily: 'sans-serif',
      }}
    >
      {layer.text}
    </div>
  )
}

function ShapeLayerComponent({
  layer,
  isSelected,
  canvasRef,
}: {
  layer: ShapeLayer
  isSelected: boolean
  canvasRef: React.RefObject<HTMLCanvasElement | null>
}) {
  const updateShapeLayer = useEditorStore(s => s.updateShapeLayer)
  const setActiveShapeLayer = useEditorStore(s => s.setActiveShapeLayer)
  const pushHistory = useEditorStore(s => s.pushHistory)

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setActiveShapeLayer(layer.id)

    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const startXPct = layer.x
    const startYPct = layer.y

    function handleMouseMove(ev: MouseEvent) {
      const dx = (ev.clientX - startX) / rect.width
      const dy = (ev.clientY - startY) / rect.height
      updateShapeLayer(layer.id, {
        x: Math.max(0, Math.min(1 - layer.w, startXPct + dx)),
        y: Math.max(0, Math.min(1 - layer.h, startYPct + dy)),
      })
    }

    function handleMouseUp() {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
      pushHistory('Move Shape')
    }

    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
  }

  return (
    <div
      onMouseDown={handleMouseDown}
      style={{
        position: 'absolute',
        left: `${layer.x * 100}%`,
        top: `${layer.y * 100}%`,
        width: `${layer.w * 100}%`,
        height: `${layer.h * 100}%`,
        outline: isSelected ? '1px dashed var(--a)' : 'none',
        pointerEvents: 'auto',
        cursor: 'move',
        zIndex: isSelected ? 20 : 10,
      }}
    >
      <svg width="100%" height="100%" style={{ display: 'block', overflow: 'visible' }}>
        {layer.type === 'rect' ? (
          <rect
            width="100%"
            height="100%"
            fill={layer.fill}
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth}
            opacity={layer.opacity / 100}
          />
        ) : (
          <ellipse
            cx="50%"
            cy="50%"
            rx="50%"
            ry="50%"
            fill={layer.fill}
            stroke={layer.stroke}
            strokeWidth={layer.strokeWidth}
            opacity={layer.opacity / 100}
          />
        )}
      </svg>
    </div>
  )
}

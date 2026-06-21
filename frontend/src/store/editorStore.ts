import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'
import type { ApiWorkflow } from '../services/api'

// ─── Adjustment Keys & Ranges ───────────────────────────────────────────────
export interface Adjustments {
  exposure: number      // -100 to 100
  brightness: number    // -100 to 100
  contrast: number      // -100 to 100
  highlights: number    // -100 to 100
  shadows: number       // -100 to 100
  whites: number        // -100 to 100
  blacks: number        // -100 to 100
  temperature: number   // -100 to 100
  tint: number          // -100 to 100
  saturation: number    // -100 to 100
  vibrance: number      // -100 to 100
  hue: number           // -180 to 180
  sharpness: number     // 0 to 100
  clarity: number       // -100 to 100
  dehaze: number        // -100 to 100
  noise: number         // 0 to 100
  vignette: number      // -100 to 0
  grain: number         // 0 to 100
  fade: number          // 0 to 100
  glow: number          // 0 to 100
}

export const DEFAULT_ADJUSTMENTS: Adjustments = {
  exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
  whites: 0, blacks: 0, temperature: 0, tint: 0, saturation: 0,
  vibrance: 0, hue: 0, sharpness: 0, clarity: 0, dehaze: 0,
  noise: 0, vignette: 0, grain: 0, fade: 0, glow: 0,
}

// ─── HSL per-color channel ──────────────────────────────────────────────────
export interface HSLChannel { h: number; s: number; l: number }
export type HSLName = 'Red' | 'Orange' | 'Yellow' | 'Green' | 'Cyan' | 'Blue'
export const HSL_NAMES: HSLName[] = ['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue']
export type HSLState = Record<HSLName, HSLChannel>

export const DEFAULT_HSL: HSLState = {
  Red:    { h: 0, s: 0, l: 0 },
  Orange: { h: 0, s: 0, l: 0 },
  Yellow: { h: 0, s: 0, l: 0 },
  Green:  { h: 0, s: 0, l: 0 },
  Cyan:   { h: 0, s: 0, l: 0 },
  Blue:   { h: 0, s: 0, l: 0 },
}

// ─── Curves ──────────────────────────────────────────────────────────────────
export interface Point { x: number; y: number }
export interface CurvesState {
  rgb: Point[]
  red: Point[]
  green: Point[]
  blue: Point[]
}

export const DEFAULT_CURVES: CurvesState = {
  rgb: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  red: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  green: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
  blue: [{ x: 0, y: 0 }, { x: 255, y: 255 }],
}

// ─── Color Grading ───────────────────────────────────────────────────────────
export interface GradingWheel {
  h: number // 0 to 360
  s: number // 0 to 100
  l: number // -100 to 100
}
export interface ColorGradingState {
  shadows: GradingWheel
  midtones: GradingWheel
  highlights: GradingWheel
}

export const DEFAULT_COLOR_GRADING: ColorGradingState = {
  shadows: { h: 0, s: 0, l: 0 },
  midtones: { h: 0, s: 0, l: 0 },
  highlights: { h: 0, s: 0, l: 0 },
}

// ─── History Entry ──────────────────────────────────────────────────────────
export interface HistoryEntry {
  label: string
  adjustments: Adjustments
  hsl: HSLState
  curves: CurvesState
  colorGrading: ColorGradingState
  timestamp: number
  imageEl?: HTMLImageElement
}

// ─── Adjustment Mask Layer ────────────────────────────────────────────────────
export interface AdjustmentLayer {
  id: string
  name: string
  visible: boolean
  adjustments: Adjustments
  hsl: HSLState
  curves: CurvesState
  colorGrading: ColorGradingState
}

// ─── Layer ──────────────────────────────────────────────────────────────────
export interface Layer {
  id: string
  name: string
  type: 'image' | 'adjustment' | 'text' | 'shape'
  visible: boolean
  locked: boolean
  opacity: number
}

// ─── Tool ───────────────────────────────────────────────────────────────────
export type Tool = 'select' | 'crop' | 'heal' | 'pick' | 'stamp' | 'text' | 'rect' | 'circle' | 'mask'

// ─── Shape Layer ─────────────────────────────────────────────────────────────
export interface ShapeLayer {
  id: string
  type: 'rect' | 'circle'
  x: number        // 0-1 fraction of canvas width
  y: number        // 0-1 fraction of canvas height
  w: number        // 0-1 fraction of canvas width
  h: number        // 0-1 fraction of canvas height
  fill: string
  stroke: string
  strokeWidth: number
  opacity: number  // 0-100
}

// ─── Text Layer ─────────────────────────────────────────────────────────────
export interface TextLayer {
  id: string
  text: string
  x: number        // 0–1 fraction of canvas width
  y: number        // 0–1 fraction of canvas height
  fontSize: number // in display pixels, scaled on export
  color: string
  fontWeight: 'normal' | 'bold'
  opacity: number  // 0–100
}

// ─── Export Format ──────────────────────────────────────────────────────────
export type ExportFormat = 'jpeg' | 'png' | 'webp'

// ─── Store ──────────────────────────────────────────────────────────────────
export interface EditorStore {
  // Image
  imageEl: HTMLImageElement | null
  imageName: string
  imageSize: number
  setImage: (img: HTMLImageElement, name: string, size: number) => void
  swapImage: (img: HTMLImageElement, name: string, size: number) => void
  clearImage: () => void

  // Backend sync — IDs returned by Django API
  projectId: string | null
  backendImageId: string | null
  isBackendSynced: boolean
  setBackendIds: (projectId: string, imageId: string) => void
  clearBackendIds: () => void

  // Adjustments (Global Base)
  adjustments: Adjustments
  setAdjustment: (key: keyof Adjustments, value: number) => void
  applyAdjustmentDelta: (deltas: Partial<Adjustments>) => void
  resetAdjustment: (key: keyof Adjustments) => void
  resetSectionKeys: (keys: (keyof Adjustments)[]) => void
  resetAllAdjustments: () => void

  // Adjustment Mask Layers (Selective Edits)
  adjustmentLayers: AdjustmentLayer[]
  activeAdjustmentLayerId: string | null
  addAdjustmentLayer: () => void
  removeAdjustmentLayer: (id: string) => void
  setActiveAdjustmentLayer: (id: string | null) => void
  setAdjustmentLayerVisibility: (id: string, visible: boolean) => void

  // HSL
  hsl: HSLState
  activeHSL: number
  setActiveHSL: (idx: number) => void
  setHSLChannel: (color: HSLName, prop: 'h' | 's' | 'l', value: number) => void

  // Curves
  curves: CurvesState
  setCurvesChannel: (channel: keyof CurvesState, points: Point[]) => void

  // Color Grading
  colorGrading: ColorGradingState
  setColorGradingChannel: (channel: keyof ColorGradingState, prop: keyof GradingWheel, value: number) => void

  // History (non-destructive)
  history: HistoryEntry[]
  historyIndex: number
  pushHistory: (label: string) => void
  jumpToHistory: (index: number) => void
  undo: () => void
  redo: () => void

  // Layers
  layers: Layer[]
  activeLayerId: string | null
  setActiveLayer: (id: string) => void
  toggleLayerVisibility: (id: string) => void
  toggleLayerLock: (id: string) => void

  // Tool & Zoom
  activeTool: Tool
  setActiveTool: (tool: Tool) => void
  zoom: number
  setZoom: (zoom: number) => void
  deltaZoom: (delta: number) => void

  // Export
  exportFormat: ExportFormat
  exportQuality: number
  setExportFormat: (fmt: ExportFormat) => void
  setExportQuality: (q: number) => void
  // Custom Presets
  customPresets: { name: string; adjustments: Adjustments }[]
  saveCustomPreset: (name: string) => void
  deleteCustomPreset: (name: string) => void

  // Text Layers
  textLayers: TextLayer[]
  addTextLayer: (layer: TextLayer) => void
  updateTextLayer: (id: string, patch: Partial<TextLayer>) => void
  removeTextLayer: (id: string) => void
  activeTextLayerId: string | null
  setActiveTextLayer: (id: string | null) => void

  // Shape Layers
  shapeLayers: ShapeLayer[]
  addShapeLayer: (layer: ShapeLayer) => void
  updateShapeLayer: (id: string, patch: Partial<ShapeLayer>) => void
  removeShapeLayer: (id: string) => void
  activeShapeLayerId: string | null
  setActiveShapeLayer: (id: string | null) => void

  // Workflows
  workflows: ApiWorkflow[]
  setWorkflows: (workflows: ApiWorkflow[]) => void

  // UI State
  editCount: number
  isProcessing: boolean
  processingMessage: string
  processingSubMessage: string
  processingStep: number
  setProcessing: (on: boolean, msg?: string, sub?: string, step?: number) => void

  toast: { message: string; isError: boolean; key: number } | null
  showToast: (msg: string, isError?: boolean) => void

  // Chat State
  chatMessages: ChatMessage[]
  addChatMessage: (msg: ChatMessage) => void
  clearChat: () => void
}

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: number
  actionCard?: {
    type: 'adjustments' | 'background' | 'undo' | 'reset' | 'unknown'
    summary: string
    details?: string
  }
}

export const useEditorStore = create<EditorStore>()(
  subscribeWithSelector((set, get) => ({
    // Image
    imageEl: null,
    imageName: '',
    imageSize: 0,
    setImage: (img, name, size) => {
      set({
        imageEl: img,
        imageName: name,
        imageSize: size,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
        curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
        colorGrading: JSON.parse(JSON.stringify(DEFAULT_COLOR_GRADING)),
        history: [],
        historyIndex: -1,
        editCount: 0,
        layers: [{ id: 'base', name: name, type: 'image', visible: true, locked: false, opacity: 100 }],
        activeLayerId: 'base',
      })
    },
    swapImage: (img, name, size) => {
      set({
        imageEl: img,
        imageName: name,
        imageSize: size,
        layers: get().layers.map(l => l.id === 'base' ? { ...l, name: name } : l)
      })
    },
    clearImage: () => set({
      imageEl: null,
      imageName: '',
      imageSize: 0,
      adjustments: { ...DEFAULT_ADJUSTMENTS },
      hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
      curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
      colorGrading: JSON.parse(JSON.stringify(DEFAULT_COLOR_GRADING)),
      history: [],
      historyIndex: -1,
      editCount: 0,
      projectId: null,
      backendImageId: null,
      isBackendSynced: false,
    }),

    // Backend sync
    projectId: null,
    backendImageId: null,
    isBackendSynced: false,
    setBackendIds: (projectId, imageId) => set({ projectId, backendImageId: imageId, isBackendSynced: true }),
    clearBackendIds: () => set({ projectId: null, backendImageId: null, isBackendSynced: false }),

    // Adjustments
    adjustments: { ...DEFAULT_ADJUSTMENTS },
    setAdjustment: (key, value) => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? { ...l, adjustments: { ...l.adjustments, [key]: value } }
              : l
          )
        }
      }
      return { adjustments: { ...s.adjustments, [key]: value } }
    }),
    applyAdjustmentDelta: (deltas) => set(s => {
      const applyDelta = (adj: Adjustments) => {
        const next = { ...adj }
        for (const [k, v] of Object.entries(deltas)) {
          const key = k as keyof Adjustments
          const clampMax = key === 'vignette' ? 0 : key === 'hue' ? 180 : 100
          const clampMin = key === 'hue' ? -180 : key === 'vignette' ? -100 :
            ['sharpness', 'noise', 'grain', 'fade', 'glow'].includes(key) ? 0 : -100
          next[key] = Math.max(clampMin, Math.min(clampMax, (next[key] ?? 0) + Math.round(v!)))
        }
        return next
      }

      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? { ...l, adjustments: applyDelta(l.adjustments) }
              : l
          )
        }
      }
      return { adjustments: applyDelta(s.adjustments) }
    }),
    resetAdjustment: (key) => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? { ...l, adjustments: { ...l.adjustments, [key]: 0 } }
              : l
          )
        }
      }
      return { adjustments: { ...s.adjustments, [key]: 0 } }
    }),
    resetSectionKeys: (keys) => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l => {
            if (l.id === s.activeAdjustmentLayerId) {
              const next = { ...l.adjustments }
              keys.forEach(k => { next[k] = 0 })
              return { ...l, adjustments: next }
            }
            return l
          })
        }
      }
      const next = { ...s.adjustments }
      keys.forEach(k => { next[k] = 0 })
      return { adjustments: next }
    }),
    resetAllAdjustments: () => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? {
                  ...l,
                  adjustments: { ...DEFAULT_ADJUSTMENTS },
                  hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
                  curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
                  colorGrading: JSON.parse(JSON.stringify(DEFAULT_COLOR_GRADING))
                }
              : l
          )
        }
      }
      return {
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
        curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
        colorGrading: JSON.parse(JSON.stringify(DEFAULT_COLOR_GRADING)),
      }
    }),

    // Adjustment Mask Layers
    adjustmentLayers: [],
    activeAdjustmentLayerId: null,
    addAdjustmentLayer: () => set(s => {
      const newLayer: AdjustmentLayer = {
        id: 'adj_' + Date.now().toString(),
        name: 'Mask Layer ' + (s.adjustmentLayers.length + 1),
        visible: true,
        adjustments: { ...DEFAULT_ADJUSTMENTS },
        hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
        curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
        colorGrading: JSON.parse(JSON.stringify(DEFAULT_COLOR_GRADING))
      }
      return { adjustmentLayers: [...s.adjustmentLayers, newLayer], activeAdjustmentLayerId: newLayer.id }
    }),
    removeAdjustmentLayer: (id) => set(s => ({
      adjustmentLayers: s.adjustmentLayers.filter(l => l.id !== id),
      activeAdjustmentLayerId: s.activeAdjustmentLayerId === id ? null : s.activeAdjustmentLayerId
    })),
    setActiveAdjustmentLayer: (id) => set({ activeAdjustmentLayerId: id }),
    setAdjustmentLayerVisibility: (id, visible) => set(s => ({
      adjustmentLayers: s.adjustmentLayers.map(l => l.id === id ? { ...l, visible } : l)
    })),

    // HSL
    hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
    activeHSL: 0,
    setActiveHSL: (idx) => set({ activeHSL: idx }),
    setHSLChannel: (color, prop, value) => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? { ...l, hsl: { ...l.hsl, [color]: { ...l.hsl[color], [prop]: value } } }
              : l
          )
        }
      }
      return {
        hsl: { ...s.hsl, [color]: { ...s.hsl[color], [prop]: value } }
      }
    }),

    // Curves
    curves: JSON.parse(JSON.stringify(DEFAULT_CURVES)),
    setCurvesChannel: (channel, points) => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? { ...l, curves: { ...l.curves, [channel]: points } }
              : l
          )
        }
      }
      return { curves: { ...s.curves, [channel]: points } }
    }),

    // Color Grading
    colorGrading: JSON.parse(JSON.stringify(DEFAULT_COLOR_GRADING)),
    setColorGradingChannel: (channel, prop, value) => set(s => {
      if (s.activeAdjustmentLayerId) {
        return {
          adjustmentLayers: s.adjustmentLayers.map(l =>
            l.id === s.activeAdjustmentLayerId
              ? { ...l, colorGrading: { ...l.colorGrading, [channel]: { ...l.colorGrading[channel], [prop]: value } } }
              : l
          )
        }
      }
      return {
        colorGrading: {
          ...s.colorGrading,
          [channel]: { ...s.colorGrading[channel], [prop]: value }
        }
      }
    }),

    // History
    history: [],
    historyIndex: -1,
    pushHistory: (label) => {
      const { adjustments, hsl, curves, colorGrading, history, historyIndex, imageEl } = get()
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push({
        label,
        adjustments: { ...adjustments },
        hsl: JSON.parse(JSON.stringify(hsl)),
        curves: JSON.parse(JSON.stringify(curves)),
        colorGrading: JSON.parse(JSON.stringify(colorGrading)),
        timestamp: Date.now(),
        imageEl: imageEl || undefined,
      })
      set(s => ({ history: newHistory, historyIndex: newHistory.length - 1, editCount: s.editCount + 1 }))
    },
    jumpToHistory: (index) => {
      const { history } = get()
      if (index < 0 || index >= history.length) return
      const snap = history[index]
      const nextState: any = {
        adjustments: { ...snap.adjustments },
        hsl: JSON.parse(JSON.stringify(snap.hsl)),
        curves: JSON.parse(JSON.stringify(snap.curves || DEFAULT_CURVES)),
        colorGrading: JSON.parse(JSON.stringify(snap.colorGrading || DEFAULT_COLOR_GRADING)),
        historyIndex: index,
      }
      if (snap.imageEl) {
        nextState.imageEl = snap.imageEl
      }
      set(nextState)
    },
    undo: () => {
      const { historyIndex } = get()
      if (historyIndex > 0) get().jumpToHistory(historyIndex - 1)
    },
    redo: () => {
      const { historyIndex, history } = get()
      if (historyIndex < history.length - 1) get().jumpToHistory(historyIndex + 1)
    },

    // Layers
    layers: [],
    activeLayerId: null,
    setActiveLayer: (id) => set({ activeLayerId: id }),
    toggleLayerVisibility: (id) => set(s => ({
      layers: s.layers.map(l => l.id === id ? { ...l, visible: !l.visible } : l)
    })),
    toggleLayerLock: (id) => set(s => ({
      layers: s.layers.map(l => l.id === id ? { ...l, locked: !l.locked } : l)
    })),

    // Tool & Zoom
    activeTool: 'select',
    setActiveTool: (tool) => set({ activeTool: tool }),
    zoom: 1,
    setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(8, zoom)) }),
    deltaZoom: (delta) => set(s => ({ zoom: Math.max(0.05, Math.min(8, s.zoom + delta)) })),

    // Export
    exportFormat: 'jpeg',
    exportQuality: 92,
    setExportFormat: (fmt) => set({ exportFormat: fmt }),
    setExportQuality: (q: number) => set({ exportQuality: q }),

    // Custom Presets
    customPresets: (() => {
      try {
        const stored = localStorage.getItem('lumio_custom_presets')
        return stored ? JSON.parse(stored) : []
      } catch {
        return []
      }
    })(),
    saveCustomPreset: (name) => {
      const { adjustments, customPresets } = get()
      const updated = [...customPresets, { name, adjustments: { ...adjustments } }]
      localStorage.setItem('lumio_custom_presets', JSON.stringify(updated))
      set({ customPresets: updated })
    },
    deleteCustomPreset: (name) => {
      const { customPresets } = get()
      const updated = customPresets.filter(p => p.name !== name)
      localStorage.setItem('lumio_custom_presets', JSON.stringify(updated))
      set({ customPresets: updated })
    },

    // UI
    editCount: 0,
    isProcessing: false,
    processingMessage: '',
    processingSubMessage: '',
    processingStep: 0,
    setProcessing: (on, msg = '', sub = '', step = 0) => set({
      isProcessing: on,
      processingMessage: msg,
      processingSubMessage: sub,
      processingStep: step,
    }),

    toast: null,
    showToast: (message, isError = false) => set({ toast: { message, isError, key: Date.now() } }),

    // Chat State
    chatMessages: [],
    addChatMessage: (msg) => set(s => ({ chatMessages: [...s.chatMessages, msg] })),
    clearChat: () => set({ chatMessages: [] }),

    // Text Layers
    textLayers: [],
    activeTextLayerId: null,
    addTextLayer: (layer) => set(s => ({ textLayers: [...s.textLayers, layer], activeTextLayerId: layer.id })),
    updateTextLayer: (id, patch) => set(s => ({
      textLayers: s.textLayers.map(l => l.id === id ? { ...l, ...patch } : l)
    })),
    removeTextLayer: (id) => set(s => ({
      textLayers: s.textLayers.filter(l => l.id !== id),
      activeTextLayerId: s.activeTextLayerId === id ? null : s.activeTextLayerId,
    })),
    setActiveTextLayer: (id) => set({ activeTextLayerId: id }),

    // Shape Layers
    shapeLayers: [],
    activeShapeLayerId: null,
    addShapeLayer: (layer) => set(s => ({ shapeLayers: [...s.shapeLayers, layer], activeShapeLayerId: layer.id })),
    updateShapeLayer: (id, patch) => set(s => ({
      shapeLayers: s.shapeLayers.map(l => l.id === id ? { ...l, ...patch } : l)
    })),
    removeShapeLayer: (id) => set(s => ({
      shapeLayers: s.shapeLayers.filter(l => l.id !== id),
      activeShapeLayerId: s.activeShapeLayerId === id ? null : s.activeShapeLayerId,
    })),
    setActiveShapeLayer: (id) => set({ activeShapeLayerId: id }),

    // Workflows
    workflows: [],
    setWorkflows: (workflows) => set({ workflows }),
  }))
)

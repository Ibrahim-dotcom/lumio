import { create } from 'zustand'
import { subscribeWithSelector } from 'zustand/middleware'

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

// ─── History Entry ──────────────────────────────────────────────────────────
export interface HistoryEntry {
  label: string
  adjustments: Adjustments
  hsl: HSLState
  timestamp: number
  imageEl?: HTMLImageElement
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
export type Tool = 'select' | 'crop' | 'heal' | 'pick'

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

  // Adjustments
  adjustments: Adjustments
  setAdjustment: (key: keyof Adjustments, value: number) => void
  applyAdjustmentDelta: (deltas: Partial<Adjustments>) => void
  resetAdjustment: (key: keyof Adjustments) => void
  resetSectionKeys: (keys: (keyof Adjustments)[]) => void
  resetAllAdjustments: () => void

  // HSL
  hsl: HSLState
  activeHSL: number
  setActiveHSL: (idx: number) => void
  setHSLChannel: (color: HSLName, prop: 'h' | 's' | 'l', value: number) => void

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

  // UI State
  editCount: number
  isProcessing: boolean
  processingMessage: string
  processingSubMessage: string
  processingStep: number
  setProcessing: (on: boolean, msg?: string, sub?: string, step?: number) => void

  toast: { message: string; isError: boolean; key: number } | null
  showToast: (msg: string, isError?: boolean) => void
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
    setAdjustment: (key, value) => {
      set(s => ({ adjustments: { ...s.adjustments, [key]: value } }))
    },
    applyAdjustmentDelta: (deltas) => {
      set(s => {
        const next = { ...s.adjustments }
        for (const [k, v] of Object.entries(deltas)) {
          const key = k as keyof Adjustments
          const clampMax = key === 'vignette' ? 0 : key === 'hue' ? 180 : 100
          const clampMin = key === 'hue' ? -180 : key === 'vignette' ? -100 :
            ['sharpness', 'noise', 'grain', 'fade', 'glow'].includes(key) ? 0 : -100
          next[key] = Math.max(clampMin, Math.min(clampMax, (next[key] ?? 0) + Math.round(v!)))
        }
        return { adjustments: next }
      })
    },
    resetAdjustment: (key) => {
      set(s => ({ adjustments: { ...s.adjustments, [key]: 0 } }))
    },
    resetSectionKeys: (keys) => {
      set(s => {
        const next = { ...s.adjustments }
        keys.forEach(k => { next[k] = 0 })
        return { adjustments: next }
      })
    },
    resetAllAdjustments: () => set({ adjustments: { ...DEFAULT_ADJUSTMENTS }, hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)) }),

    // HSL
    hsl: JSON.parse(JSON.stringify(DEFAULT_HSL)),
    activeHSL: 0,
    setActiveHSL: (idx) => set({ activeHSL: idx }),
    setHSLChannel: (color, prop, value) => {
      set(s => ({
        hsl: { ...s.hsl, [color]: { ...s.hsl[color], [prop]: value } }
      }))
    },

    // History
    history: [],
    historyIndex: -1,
    pushHistory: (label) => {
      const { adjustments, hsl, history, historyIndex, imageEl } = get()
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push({
        label,
        adjustments: { ...adjustments },
        hsl: JSON.parse(JSON.stringify(hsl)),
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
  }))
)

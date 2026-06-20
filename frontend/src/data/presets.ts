import type { Adjustments } from '../store/editorStore'

// ─── Preset Definition ────────────────────────────────────────────────────────
export interface Preset {
  name: string
  emoji: string
  adjustments: Partial<Adjustments>
}

export const PRESETS: Preset[] = [
  { name: 'Original',   emoji: '◯',  adjustments: {} },
  { name: 'Vivid',      emoji: '✦',  adjustments: { saturation: 44, vibrance: 30, contrast: 18, clarity: 12 } },
  { name: 'Matte',      emoji: '□',  adjustments: { contrast: -24, brightness: 10, saturation: -20, fade: 28 } },
  { name: 'Cinema',     emoji: '🎬', adjustments: { contrast: 28, temperature: -20, saturation: 18, vignette: -42, clarity: 14 } },
  { name: 'Golden',     emoji: '🌅', adjustments: { temperature: 42, brightness: 8, saturation: 24, vibrance: 14 } },
  { name: 'Moody',      emoji: '🌙', adjustments: { exposure: -14, contrast: 32, saturation: -24, vignette: -52, shadows: -12 } },
  { name: 'Faded',      emoji: '〰',  adjustments: { contrast: -28, brightness: 16, saturation: -28, fade: 36 } },
  { name: 'Chrome',     emoji: '◈',  adjustments: { saturation: -100, contrast: 12, clarity: 8 } },
  { name: 'Velvia',     emoji: '🍃', adjustments: { saturation: 58, contrast: 22, vibrance: 18, sharpness: 28 } },
  { name: 'Kodak',      emoji: '📷', adjustments: { temperature: 18, saturation: 16, contrast: 10, highlights: -12, fade: 10 } },
  { name: 'Teal+Or',    emoji: '◑',  adjustments: { temperature: -16, tint: -10, saturation: 24, contrast: 18 } },
  { name: 'Dreamy',     emoji: '✿',  adjustments: { brightness: 14, saturation: -8, glow: 42, clarity: -18, fade: 22 } },
  { name: 'Fashion',    emoji: '👗', adjustments: { contrast: 18, clarity: 14, vibrance: 12, vignette: -28, whites: 12 } },
  { name: 'Luxury',     emoji: '💎', adjustments: { exposure: -8, contrast: 22, saturation: -12, clarity: 18, vignette: -36, fade: 8 } },
  { name: 'Portrait',   emoji: '👤', adjustments: { brightness: 10, vibrance: 15, clarity: -8, glow: 12, highlights: -8 } },
  { name: 'Landscape',  emoji: '🏔', adjustments: { vibrance: 28, dehaze: 22, clarity: 18, saturation: 14, shadows: 12 } },
]

// ─── Chip Prompts ─────────────────────────────────────────────────────────────
export interface Chip {
  label: string
  prompt: string
}

export const CHIPS: Chip[] = [
  { label: '☀️ Brighter',   prompt: 'Make it brighter' },
  { label: '◑ Contrast',    prompt: 'Boost the contrast' },
  { label: '🌅 Warm',       prompt: 'Warm golden tones' },
  { label: '❄️ Cool',       prompt: 'Cool blue tones' },
  { label: '◈ Sharpen',    prompt: 'Sharpen the details' },
  { label: '◐ B&W',        prompt: 'Black and white' },
  { label: '🎬 Cinema',    prompt: 'Cinematic look' },
  { label: '🎨 Vivid',     prompt: 'Vibrant saturated colors' },
  { label: '🌫 Dehaze',    prompt: 'Remove the haze' },
  { label: '✦ Dreamy',     prompt: 'Dreamy soft glow' },
  { label: '📷 Film',      prompt: 'Kodak film look' },
  { label: '🌙 Moody',     prompt: 'Dark and moody' },
  { label: '👗 Fashion',   prompt: 'Luxury fashion editorial' },
  { label: '💎 Portrait',  prompt: 'Flattering portrait look' },
]

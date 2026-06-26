import type { Adjustments } from '../store/editorStore'
import { callAIPlannerBackend } from './api'

// ─── Action Detection (pure client-side regex, no network) ───────────────────
export type DetectedAction = 'remove_background' | 'undo' | 'redo' | 'reset' | 'none'

export function detectAction(prompt: string): DetectedAction {
  const lo = prompt.toLowerCase().trim()
  if (/\b(remove background|cutout background|delete background|transparent background|cutout bg|remove bg)\b/i.test(lo)) {
    return 'remove_background'
  }
  if (/\b(undo|go back|revert last)\b/i.test(lo)) return 'undo'
  if (/\b(redo|go forward)\b/i.test(lo)) return 'redo'
  if (/\b(reset|clear adjustments|original|revert all|clear all|reset all)\b/i.test(lo)) return 'reset'
  return 'none'
}

// ─── Local fallback (used only if backend is completely unreachable) ──────────
const FALLBACK_RULES: { patterns: string[]; adj: Partial<Adjustments> }[] = [
  { patterns: ['bright', 'lighten', 'lighter'],             adj: { brightness: 28, exposure: 10 } },
  { patterns: ['dark', 'darken', 'darker', 'moody'],        adj: { brightness: -24, exposure: -12 } },
  { patterns: ['contrast', 'punch', 'pop'],                 adj: { contrast: 32, clarity: 10 } },
  { patterns: ['warm', 'golden', 'sunset', 'orange'],       adj: { temperature: 38 } },
  { patterns: ['cool', 'cold', 'blue', 'winter'],           adj: { temperature: -38 } },
  { patterns: ['vivid', 'vibrant', 'saturated', 'colorful'],adj: { saturation: 42, vibrance: 24 } },
  { patterns: ['black and white', 'b&w', 'bw', 'grayscale', 'monochrome'], adj: { saturation: -100 } },
  { patterns: ['sharpen', 'sharp', 'crisp', 'detail'],      adj: { sharpness: 55, clarity: 18 } },
  { patterns: ['soft', 'dreamy', 'dream', 'glow'],          adj: { glow: 42, clarity: -20, brightness: 8, fade: 18 } },
  { patterns: ['vignette', 'darken edges'],                  adj: { vignette: -55 } },
  { patterns: ['cinematic', 'cinema', 'film look', 'movie'], adj: { contrast: 26, temperature: -18, saturation: 18, vignette: -38, clarity: 12 } },
  { patterns: ['vintage', 'retro', 'film grain'],            adj: { saturation: -20, contrast: -15, temperature: 20, grain: 28, fade: 20 } },
  { patterns: ['dramatic', 'hdr', 'epic', 'intense'],        adj: { contrast: 38, clarity: 42, saturation: 20, dehaze: 28 } },
  { patterns: ['dehaze', 'haze', 'fog', 'mist'],             adj: { dehaze: 50, contrast: 14 } },
  { patterns: ['matte', 'faded', 'fade'],                    adj: { fade: 38, saturation: -20, contrast: -22 } },
  { patterns: ['teal and orange', 'teal+orange'],            adj: { temperature: -16, tint: -10, saturation: 22, contrast: 18 } },
  { patterns: ['kodak', 'kodachrome'],                       adj: { fade: 26, grain: 20, saturation: -15, contrast: -8, temperature: 14 } },
  { patterns: ['fashion', 'luxury', 'editorial'],            adj: { contrast: 18, clarity: 14, vibrance: 12, vignette: -28 } },
  { patterns: ['product', 'ecommerce', 'amazon'],            adj: { brightness: 15, contrast: 12, saturation: 8, whites: 18 } },
  { patterns: ['portrait', 'skin', 'face'],                  adj: { brightness: 10, vibrance: 15, clarity: -8, glow: 12 } },
  { patterns: ['landscape', 'nature', 'outdoor'],            adj: { vibrance: 28, dehaze: 22, clarity: 18, saturation: 14 } },
]

function localFallback(prompt: string): Partial<Adjustments> | { _unsupported: true } {
  const lo = prompt.toLowerCase()
  const result: Partial<Adjustments> = {}
  let hit = false
  for (const rule of FALLBACK_RULES) {
    for (const p of rule.patterns) {
      if (lo.includes(p)) { Object.assign(result, rule.adj); hit = true; break }
    }
  }
  if (!hit) return { _unsupported: true }
  const strong = /\b(very|extremely|super|heavily)\b/i.test(lo)
  const light  = /\b(slightly|a bit|subtle|barely|gently)\b/i.test(lo)
  const factor = strong ? 1.65 : light ? 0.35 : 1
  const scaled: Partial<Adjustments> = {}
  for (const [k, v] of Object.entries(result)) {
    scaled[k as keyof Adjustments] = Math.round((v as number) * factor) as never
  }
  return scaled
}

// ─── Main entrypoint — calls Django backend (Gemini key stays server-side) ───
export type AIPlannerResult = Partial<Adjustments> | { _unsupported: true }
export type AIPlannerScope = 'global' | 'sky' | 'face' | 'subject' | 'background'

export interface AIPlannerResponse {
  deltas: AIPlannerResult
  source: 'gemini' | 'fallback'
  scope: AIPlannerScope
}

export async function callAIPlanner(prompt: string): Promise<AIPlannerResponse> {
  try {
    const res = await callAIPlannerBackend(prompt)
    return {
      deltas: res.deltas as AIPlannerResult,
      source: res.source as 'gemini' | 'fallback',
      scope: (res.scope as AIPlannerScope) ?? 'global',
    }
  } catch (err) {
    console.warn('[Lumio] Backend AI planner unreachable, using local fallback.', err)
    return {
      deltas: localFallback(prompt) as AIPlannerResult,
      source: 'fallback',
      scope: 'global',
    }
  }
}

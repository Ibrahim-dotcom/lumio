import type { Adjustments } from '../store/editorStore'

// ─── Claude System Prompt ─────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are the AI engine of Lumio, a professional photo editor.
A user will describe a photo edit in natural language. You translate it into pixel adjustments.

ADJUSTMENT KEYS AND RANGES:
exposure: -100 to 100        (EV-based, like camera stops)
brightness: -100 to 100      (overall lightness)
contrast: -100 to 100        (tonal range spread)
highlights: -100 to 100      (negative = recover blown highlights)
shadows: -100 to 100         (positive = lift dark areas)
whites: -100 to 100          (clip point for whites)
blacks: -100 to 100          (clip point for blacks)
temperature: -100 to 100     (-100=cool/blue, +100=warm/orange)
tint: -100 to 100            (-100=green shift, +100=magenta shift)
saturation: -100 to 100      (overall color intensity, -100=grayscale)
vibrance: -100 to 100        (smart saturation, protects skin tones)
hue: -180 to 180             (global hue rotation in degrees)
sharpness: 0 to 100          (unsharp mask strength)
clarity: -100 to 100         (local contrast/microcontrast, negative=dreamy)
dehaze: -100 to 100          (removes/adds atmospheric haze)
noise: 0 to 100              (noise reduction via blur)
vignette: -100 to 0          (ALWAYS negative — darkens edges)
grain: 0 to 100              (film grain texture)
fade: 0 to 100               (lifts blacks for matte/film base)
glow: 0 to 100               (soft bloom on bright areas)

RULES:
1. Return ONLY raw JSON. No markdown fences, no explanation, no commentary.
2. Include ONLY keys that should change. Omit keys that stay 0.
3. Values are DELTA — how much to shift from current. Be cumulative-aware.
4. Intensity modifiers: "slightly/a bit/barely" = multiply by 0.35. "very/extremely/heavily" = multiply by 1.65.
5. If the request cannot be mapped (e.g. "remove the background", "add text") return {"_unsupported":true}.
6. Interpret intent, not just words. "Moody" implies multiple adjustments. "Like a film" implies grain+fade+desaturate.
7. Combine adjustments intelligently. "Cinematic" = contrast+slight cool+saturation+vignette.

EXAMPLES:
"make it warmer" → {"temperature":35}
"dramatic black and white" → {"saturation":-100,"contrast":32,"clarity":20,"vignette":-28}
"slightly brighter with a bit more pop" → {"brightness":18,"contrast":12,"vibrance":12}
"teal and orange movie grade" → {"temperature":-18,"tint":-10,"saturation":22,"contrast":18}
"kodak film look" → {"fade":26,"grain":20,"saturation":-15,"contrast":-8,"temperature":14}
"very dark and moody" → {"exposure":-22,"contrast":48,"saturation":-32,"vignette":-55,"shadows":-18}
"dreamy and soft" → {"glow":40,"clarity":-22,"brightness":10,"saturation":-8,"fade":18}
"remove haze and make colors pop" → {"dehaze":48,"contrast":16,"saturation":20,"vibrance":14}
"lift the shadows without touching the rest" → {"shadows":38}
"cinematic look, slightly cool" → {"contrast":25,"temperature":-14,"saturation":16,"vignette":-36,"clarity":12}`

// ─── Fallback keyword parser (offline mode) ────────────────────────────────────
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
  { patterns: ['lift shadow', 'open shadow'],                adj: { shadows: 38 } },
  { patterns: ['recover highlight'],                         adj: { highlights: -40 } },
  { patterns: ['denoise', 'reduce noise', 'clean'],          adj: { noise: 62 } },
  { patterns: ['kodak', 'kodachrome'],                       adj: { fade: 26, grain: 20, saturation: -15, contrast: -8, temperature: 14 } },
  { patterns: ['fashion', 'luxury', 'editorial'],            adj: { contrast: 18, clarity: 14, vibrance: 12, vignette: -28 } },
  { patterns: ['product', 'ecommerce', 'amazon'],            adj: { brightness: 15, contrast: 12, saturation: 8, whites: 18 } },
  { patterns: ['portrait', 'skin', 'face'],                  adj: { brightness: 10, vibrance: 15, clarity: -8, glow: 12 } },
  { patterns: ['landscape', 'nature', 'outdoor'],            adj: { vibrance: 28, dehaze: 22, clarity: 18, saturation: 14 } },
]

function fallbackParse(prompt: string): Partial<Adjustments> | { _unsupported: true } {
  const lo = prompt.toLowerCase()
  const result: Partial<Adjustments> = {}
  let hit = false

  for (const rule of FALLBACK_RULES) {
    for (const p of rule.patterns) {
      if (lo.includes(p)) {
        Object.assign(result, rule.adj)
        hit = true
        break
      }
    }
  }

  if (!hit) return { _unsupported: true }

  const strong = /\b(very|extremely|super|heavily|really|a lot)\b/i.test(lo)
  const light = /\b(slightly|a bit|subtle|barely|gently|just a)\b/i.test(lo)
  const factor = strong ? 1.65 : light ? 0.35 : 1

  const scaled: Partial<Adjustments> = {}
  for (const [k, v] of Object.entries(result)) {
    scaled[k as keyof Adjustments] = Math.round((v as number) * factor) as never
  }
  return scaled
}

// ─── Main Claude API call ─────────────────────────────────────────────────────
export type AIPlannerResult =
  | Partial<Adjustments>
  | { _unsupported: true }

export async function callAIPlanner(prompt: string): Promise<AIPlannerResult> {
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': '', // User provides this — falls back gracefully if empty
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const data = await res.json()
    const raw = (data.content?.[0]?.text || '')
      .replace(/```[\w]*\n?/g, '')
      .replace(/```/g, '')
      .trim()
    return JSON.parse(raw)
  } catch (e) {
    console.warn('[Lumio] Claude API unavailable, using fallback parser.', (e as Error).message)
    return fallbackParse(prompt)
  }
}

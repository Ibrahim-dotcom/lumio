import type { Adjustments, CurvesState, ColorGradingState, AdjustmentLayer } from '../store/editorStore'

function clamp(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0
}

function interpolateCurve(val: number, points: { x: number; y: number }[]): number {
  if (!points || points.length === 0) return val
  const sorted = [...points].sort((a, b) => a.x - b.x)
  if (val <= sorted[0].x) return sorted[0].y
  if (val >= sorted[sorted.length - 1].x) return sorted[sorted.length - 1].y

  for (let i = 0; i < sorted.length - 1; i++) {
    const p1 = sorted[i]
    const p2 = sorted[i + 1]
    if (val >= p1.x && val <= p2.x) {
      if (p2.x === p1.x) return p1.y
      const t = (val - p1.x) / (p2.x - p1.x)
      return p1.y + t * (p2.y - p1.y)
    }
  }
  return val
}

function hueToRgbOffset(hue: number, sat: number): [number, number, number] {
  if (sat === 0) return [0, 0, 0]
  const rad = (hue * Math.PI) / 180
  const r = Math.cos(rad)
  const g = Math.cos(rad - (2 * Math.PI) / 3)
  const b = Math.cos(rad + (2 * Math.PI) / 3)
  const factor = (sat / 100) * 25
  return [r * factor, g * factor, b * factor]
}

// Struct to store precomputed parameters for each adjustment/layer run
interface RenderParams {
  lutR: Uint8Array
  lutG: Uint8Array
  lutB: Uint8Array
  sR: number; sG: number; sB: number
  mR: number; mG: number; mB: number
  hR: number; hG: number; hB: number
  expF: number
  brt: number
  conF: number
  tmp: number
  tnt: number
  satF: number
  vibF: number
  wh: number
  bl: number
  hi: number
  sh: number
  cla: number
  deh: number
  fadeF: number
  glwF: number
  hRad: number
}

function prepareParams(a: Adjustments, curves?: CurvesState, colorGrading?: ColorGradingState): RenderParams {
  const lutR = new Uint8Array(256)
  const lutG = new Uint8Array(256)
  const lutB = new Uint8Array(256)
  for (let i = 0; i < 256; i++) {
    let r = curves ? interpolateCurve(i, curves.red) : i
    let g = curves ? interpolateCurve(i, curves.green) : i
    let b = curves ? interpolateCurve(i, curves.blue) : i

    if (curves && curves.rgb) {
      r = interpolateCurve(r, curves.rgb)
      g = interpolateCurve(g, curves.rgb)
      b = interpolateCurve(b, curves.rgb)
    }

    lutR[i] = r < 0 ? 0 : r > 255 ? 255 : r | 0
    lutG[i] = g < 0 ? 0 : g > 255 ? 255 : g | 0
    lutB[i] = b < 0 ? 0 : b > 255 ? 255 : b | 0
  }

  const [sR, sG, sB] = colorGrading ? hueToRgbOffset(colorGrading.shadows.h, colorGrading.shadows.s) : [0,0,0]
  const [mR, mG, mB] = colorGrading ? hueToRgbOffset(colorGrading.midtones.h, colorGrading.midtones.s) : [0,0,0]
  const [hR, hG, hB] = colorGrading ? hueToRgbOffset(colorGrading.highlights.h, colorGrading.highlights.s) : [0,0,0]

  return {
    lutR, lutG, lutB,
    sR, sG, sB,
    mR, mG, mB,
    hR, hG, hB,
    expF: Math.pow(2, (a.exposure / 100) * 2.2),
    brt: (a.brightness / 100) * 85,
    conF: 1 + (a.contrast / 100) * 1.85,
    tmp: a.temperature / 100,
    tnt: a.tint / 100,
    satF: 1 + a.saturation / 100,
    vibF: a.vibrance / 100,
    wh: a.whites / 100,
    bl: a.blacks / 100,
    hi: a.highlights / 100,
    sh: a.shadows / 100,
    cla: a.clarity / 100,
    deh: a.dehaze / 100,
    fadeF: a.fade / 100,
    glwF: a.glow / 100,
    hRad: (a.hue / 180) * Math.PI
  }
}

// Single-pixel processor
function processPixel(r: number, g: number, b: number, p: RenderParams, colorGrading?: ColorGradingState): [number, number, number] {
  // 1. Exposure (EV-based multiplication)
  r *= p.expF; g *= p.expF; b *= p.expF

  // 2. Brightness (additive)
  r += p.brt; g += p.brt; b += p.brt

  // 3. Contrast (S-curve around midpoint)
  r = (r - 128) * p.conF + 128
  g = (g - 128) * p.conF + 128
  b = (b - 128) * p.conF + 128

  // 4. Whites (lift near-white pixels)
  if (p.wh > 0) { r += (255 - r) * p.wh * 0.72; g += (255 - g) * p.wh * 0.72; b += (255 - b) * p.wh * 0.72 }

  // 5. Blacks (crush near-black pixels)
  if (p.bl > 0) { r *= (1 - p.bl * 0.62); g *= (1 - p.bl * 0.62); b *= (1 - p.bl * 0.62) }

  // 6. Highlights & Shadows (luminosity-aware)
  const lum = 0.299 * r + 0.587 * g + 0.114 * b
  if (p.hi < 0 && lum > 150) { const f = Math.pow((lum - 150) / 105, 1.1); r += p.hi * 74 * f; g += p.hi * 74 * f; b += p.hi * 74 * f }
  if (p.hi > 0 && lum > 200) { const f = (lum - 200) / 55; r += p.hi * 42 * f; g += p.hi * 42 * f; b += p.hi * 42 * f }
  if (p.sh > 0 && lum < 90)  { const f = Math.pow((90 - lum) / 90, 1.1); r += p.sh * 74 * f; g += p.sh * 74 * f; b += p.sh * 74 * f }
  if (p.sh < 0 && lum < 60)  { const f = (60 - lum) / 60; r += p.sh * 50 * f; g += p.sh * 50 * f; b += p.sh * 50 * f }

  // 7. Temperature (blue–orange axis)
  r += p.tmp * 48; b -= p.tmp * 48

  // 8. Tint (green–magenta axis)
  g += p.tnt * 24

  // 9. Global hue rotation (RGB → HSL → rotate → RGB)
  if (p.hRad !== 0) {
    const rn = r / 255, gn = g / 255, bn = b / 255
    const mx = Math.max(rn, gn, bn), mn = Math.min(rn, gn, bn), dl = mx - mn
    if (dl > 0.001) {
      let H2 = 0
      if (mx === rn) H2 = ((gn - bn) / dl) % 6
      else if (mx === gn) H2 = (bn - rn) / dl + 2
      else H2 = (rn - gn) / dl + 4
      H2 = H2 * Math.PI / 3 + p.hRad
      const L = (mx + mn) / 2, S = dl / (1 - Math.abs(2 * L - 1))
      const C = (1 - Math.abs(2 * L - 1)) * S
      const X = C * (1 - Math.abs(((H2 / (Math.PI / 3)) % 2) - 1)), m = L - C / 2
      const seg = ((Math.floor(H2 / (Math.PI / 3)) % 6) + 6) % 6
      const T = [[C,X,0],[X,C,0],[0,C,X],[0,X,C],[X,0,C],[C,0,X]][seg]
      r = (T[0] + m) * 255; g = (T[1] + m) * 255; b = (T[2] + m) * 255
    }
  }

  // 10. Saturation
  const gr = 0.299 * r + 0.587 * g + 0.114 * b
  r = gr + (r - gr) * p.satF; g = gr + (g - gr) * p.satF; b = gr + (b - gr) * p.satF

  // 11. Vibrance (smart saturation — protects skin tones)
  if (p.vibF !== 0) {
    const av = (r + g + b) / 3, mx2 = Math.max(r, g, b)
    const vf = p.vibF * (1 - (mx2 - av) / 140) * 0.82
    const grv = 0.299 * r + 0.587 * g + 0.114 * b
    r = grv + (r - grv) * (1 + vf); g = grv + (g - grv) * (1 + vf); b = grv + (b - grv) * (1 + vf)
  }

  // 11.5 Curves mapping
  r = p.lutR[clamp(r)]
  g = p.lutG[clamp(g)]
  b = p.lutB[clamp(b)]

  // 11.6 Color grading (split-toning)
  if (colorGrading) {
    const lumCG = 0.299 * r + 0.587 * g + 0.114 * b
    const wS = Math.pow(Math.max(0, 1 - lumCG / 128), 1.5)
    const wH = Math.pow(Math.max(0, (lumCG - 128) / 128), 1.5)
    const wM = Math.max(0, 1 - wS - wH)

    r += p.sR * wS + p.mR * wM + p.hR * wH
    g += p.sG * wS + p.mG * wM + p.hG * wH
    b += p.sB * wS + p.mB * wM + p.hB * wH

    const lOffset = (colorGrading.shadows.l * wS + colorGrading.midtones.l * wM + colorGrading.highlights.l * wH) * 0.4
    r += lOffset; g += lOffset; b += lOffset
  }

  // 12. Clarity (local contrast)
  if (p.cla > 0) { const cl = 0.299*r+0.587*g+0.114*b; r+=(cl-128)*p.cla*0.52; g+=(cl-128)*p.cla*0.52; b+=(cl-128)*p.cla*0.52 }
  if (p.cla < 0) { const cl = 0.299*r+0.587*g+0.114*b; r+=p.cla*0.42*(r-cl); g+=p.cla*0.42*(g-cl); b+=p.cla*0.42*(b-cl) }

  // 13. Dehaze
  if (p.deh > 0) {
    r += p.deh * 30 * (1 - r/255); g += p.deh * 30 * (1 - g/255); b += p.deh * 30 * (1 - b/255)
    const cl = 0.299*r+0.587*g+0.114*b
    r = (r-cl)*(1+p.deh*0.55)+cl; g = (g-cl)*(1+p.deh*0.55)+cl; b = (b-cl)*(1+p.deh*0.55)+cl
  }

  // 14. Fade (matte/film base — lifts blacks)
  if (p.fadeF > 0) { r = r*(1-p.fadeF*0.52)+p.fadeF*36; g = g*(1-p.fadeF*0.52)+p.fadeF*36; b = b*(1-p.fadeF*0.52)+p.fadeF*36 }

  // 15. Glow (soft bloom in highlights)
  if (p.glwF > 0) { const l2 = 0.299*r+0.587*g+0.114*b; if (l2>105) { const f=(l2-105)/150; r+=p.glwF*f*52; g+=p.glwF*f*52; b+=p.glwF*f*52 } }

  return [clamp(r), clamp(g), clamp(b)]
}

export function pixelPipeline(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  a: Adjustments,
  curves?: CurvesState,
  colorGrading?: ColorGradingState,
  adjustmentLayers: AdjustmentLayer[] = [],
  maskCanvases: Record<string, HTMLCanvasElement> = {}
): void {
  const id = ctx.getImageData(0, 0, W, H)
  const d = id.data

  // 1. Prepare global settings
  const baseParams = prepareParams(a, curves, colorGrading)

  // 2. Prepare adjustment layers settings
  const layersToApply = adjustmentLayers.filter(l => l.visible && maskCanvases[l.id])
  const layersParams = layersToApply.map(l => prepareParams(l.adjustments, l.curves, l.colorGrading))
  const layersMaskData = layersToApply.map(l => {
    const maskCtx = maskCanvases[l.id].getContext('2d')!
    return maskCtx.getImageData(0, 0, W, H).data
  })

  // 3. Pixel Loop
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2]

    // A. Apply base global adjustments
    let [gr, gg, gb] = processPixel(r, g, b, baseParams, colorGrading)

    // B. Apply local adjustment layers sequentially
    for (let lIdx = 0; lIdx < layersToApply.length; lIdx++) {
      const maskData = layersMaskData[lIdx]
      const alpha = maskData[i + 3] // Alpha channel of the mask (0-255)
      
      if (alpha > 0) {
        // Calculate adjusted pixel specifically for this layer
        const [lr, lg, lb] = processPixel(r, g, b, layersParams[lIdx], layersToApply[lIdx].colorGrading)
        const t = alpha / 255
        
        // Blend between current color and local color
        gr = gr + (lr - gr) * t
        gg = gg + (lg - gg) * t
        gb = gb + (lb - gb) * t
      }
    }

    d[i] = clamp(gr)
    d[i+1] = clamp(gg)
    d[i+2] = clamp(gb)
  }
  ctx.putImageData(id, 0, 0)

  // Post-process passes (applied globally to the composite result)
  if (a.sharpness > 0) applySharp(ctx, W, H, a.sharpness / 100)
  if (a.noise > 0)     applyBlur(ctx, W, H, Math.ceil(a.noise / 55))
  if (a.grain > 0)     applyGrain(ctx, W, H, a.grain / 100)
  if (a.vignette < 0)  applyVignette(ctx, W, H, a.vignette / 100)
}

// ─── Unsharp mask ─────────────────────────────────────────────────────────────
function applySharp(ctx: CanvasRenderingContext2D, W: number, H: number, str: number): void {
  const K = [0, -1, 0, -1, 5, -1, 0, -1, 0]
  const src = ctx.getImageData(0, 0, W, H)
  const dst = ctx.createImageData(W, H)
  const s = src.data, d = dst.data, f = str * 0.92

  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = (y * W + x) * 4
      for (let c = 0; c < 3; c++) {
        let sum = 0
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            sum += s[((y + ky) * W + (x + kx)) * 4 + c] * K[(ky + 1) * 3 + (kx + 1)]
          }
        }
        d[i + c] = clamp(s[i + c] + (sum - s[i + c]) * f)
      }
      d[i + 3] = s[i + 3]
    }
  }
  // Copy border pixels
  for (let x = 0; x < W; x++) {
    const p = x * 4
    for (let c = 0; c < 4; c++) { d[p + c] = s[p + c]; const q = ((H-1)*W+x)*4; d[q+c] = s[q+c] }
  }
  for (let y = 0; y < H; y++) {
    const p = y * W * 4
    for (let c = 0; c < 4; c++) { d[p+c] = s[p+c]; const q = (y*W+W-1)*4; d[q+c] = s[q+c] }
  }
  ctx.putImageData(dst, 0, 0)
}

// ─── Box blur (noise reduction) ───────────────────────────────────────────────
function applyBlur(ctx: CanvasRenderingContext2D, W: number, H: number, r: number): void {
  if (r < 1) return
  for (let p = 0; p < 2; p++) {
    const src = ctx.getImageData(0, 0, W, H)
    const dst = ctx.createImageData(W, H)
    const s = src.data, d = dst.data
    for (let y = r; y < H - r; y++) {
      for (let x = r; x < W - r; x++) {
        let sr = 0, sg = 0, sb = 0, cnt = 0
        for (let ky = -r; ky <= r; ky++) {
          for (let kx = -r; kx <= r; kx++) {
            const j = ((y + ky) * W + (x + kx)) * 4
            sr += s[j]; sg += s[j+1]; sb += s[j+2]; cnt++
          }
        }
        const i = (y * W + x) * 4
        d[i] = sr/cnt|0; d[i+1] = sg/cnt|0; d[i+2] = sb/cnt|0; d[i+3] = s[i+3]
      }
    }
    ctx.putImageData(dst, 0, 0)
  }
}

// ─── Film grain ───────────────────────────────────────────────────────────────
function applyGrain(ctx: CanvasRenderingContext2D, W: number, H: number, str: number): void {
  const id = ctx.getImageData(0, 0, W, H)
  const d = id.data
  const amt = str * 30
  for (let i = 0; i < d.length; i += 4) {
    const n = (Math.random() - 0.5) * amt * 2
    d[i] = clamp(d[i] + n); d[i+1] = clamp(d[i+1] + n); d[i+2] = clamp(d[i+2] + n)
  }
  ctx.putImageData(id, 0, 0)
}

// ─── Vignette ─────────────────────────────────────────────────────────────────
function applyVignette(ctx: CanvasRenderingContext2D, W: number, H: number, str: number): void {
  const g = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.2, W/2, H/2, Math.max(W,H)*0.82)
  g.addColorStop(0, 'rgba(0,0,0,0)')
  g.addColorStop(1, `rgba(0,0,0,${Math.abs(str) * 0.93})`)
  ctx.fillStyle = g
  ctx.fillRect(0, 0, W, H)
}

// ─── Histogram ────────────────────────────────────────────────────────────────
export function drawHistogram(
  mainCtx: CanvasRenderingContext2D,
  W: number,
  H: number,
  histCanvas: HTMLCanvasElement
): void {
  const hw = histCanvas.parentElement?.clientWidth ? histCanvas.parentElement.clientWidth - 24 : 220
  histCanvas.width = hw
  histCanvas.height = 50
  const hx = histCanvas.getContext('2d')!
  hx.clearRect(0, 0, hw, 50)

  const sw = Math.min(W, 300), sh = Math.min(H, 225)
  const src = mainCtx.getImageData(0, 0, sw, sh)
  const d = src.data
  const R = new Float32Array(256), G = new Float32Array(256), B = new Float32Array(256)
  for (let i = 0; i < d.length; i += 4) { R[d[i]]++; G[d[i+1]]++; B[d[i+2]]++ }
  const mx = Math.max(...R, ...G, ...B) || 1

  const drawCh = (ch: Float32Array, col: string) => {
    hx.beginPath(); hx.moveTo(0, 50)
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * hw, y = 50 - (ch[i] / mx) * 48
      i === 0 ? hx.moveTo(x, y) : hx.lineTo(x, y)
    }
    hx.lineTo(hw, 50); hx.closePath(); hx.fillStyle = col; hx.fill()
  }
  drawCh(R, 'rgba(255,80,80,0.44)')
  drawCh(G, 'rgba(60,210,100,0.44)')
  drawCh(B, 'rgba(90,140,255,0.44)')

  // ── Mirror to the visible right-panel histogram ──────────────────────────────
  const visibleHist = document.getElementById('lumio-histogram') as HTMLCanvasElement | null
  if (visibleHist && visibleHist !== histCanvas) {
    const parentW = visibleHist.parentElement?.clientWidth
    const vw = parentW ? parentW - 24 : hw
    visibleHist.width = vw
    visibleHist.height = 50
    const vx = visibleHist.getContext('2d')!
    vx.clearRect(0, 0, vw, 50)
    vx.drawImage(histCanvas, 0, 0, hw, 50, 0, 0, vw, 50)
  }
}

// ─── Preset preview renderer ──────────────────────────────────────────────────
export function renderPresetPreview(
  imgEl: HTMLImageElement,
  canvas: HTMLCanvasElement,
  adjustments: Partial<Adjustments>
): void {
  const SIZE = 60
  canvas.width = SIZE; canvas.height = SIZE
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  const sc = Math.min(SIZE / imgEl.naturalWidth, SIZE / imgEl.naturalHeight)
  ctx.fillStyle = '#111'
  ctx.fillRect(0, 0, SIZE, SIZE)
  ctx.drawImage(
    imgEl,
    (SIZE - imgEl.naturalWidth * sc) / 2,
    (SIZE - imgEl.naturalHeight * sc) / 2,
    imgEl.naturalWidth * sc,
    imgEl.naturalHeight * sc
  )
  const adj: Adjustments = { ...defaultAdj(), ...adjustments }
  pixelPipeline(ctx, SIZE, SIZE, adj)
}

function defaultAdj(): Adjustments {
  return {
    exposure: 0, brightness: 0, contrast: 0, highlights: 0, shadows: 0,
    whites: 0, blacks: 0, temperature: 0, tint: 0, saturation: 0,
    vibrance: 0, hue: 0, sharpness: 0, clarity: 0, dehaze: 0,
    noise: 0, vignette: 0, grain: 0, fade: 0, glow: 0,
  }
}

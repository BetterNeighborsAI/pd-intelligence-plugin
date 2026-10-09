// Pure chart builders for the /pd panel: SVG for the surfaces that draw it
// (desktop, mobile, vscode), text for the terminal. Nothing here calls PD.

export type ChartPoint = { label: string; value: number }
export type MixPart = { platform: string; posts: number }

const BARS = '▁▂▃▄▅▆▇█'

export function sparkline(values: readonly number[]): string {
  if (values.length === 0) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  if (max === min) return BARS[max === 0 ? 0 : 3].repeat(values.length)
  return values.map(v => BARS[Math.round(((v - min) / (max - min)) * (BARS.length - 1))]).join('')
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// One color per metric, from the dataviz reference palette's categorical slots, [light, dark];
// the SVG picks by the reader's color scheme.
export const SERIES = {
  blue: ['#2a78d6', '#3987e5'],
  aqua: ['#1baf7a', '#199e70'],
  violet: ['#4a3aa7', '#9085e9'],
} as const
export type Series = keyof typeof SERIES

const seriesStyle = (series: Series) =>
  `<style>.s{fill:${SERIES[series][0]};stroke:${SERIES[series][0]}}.axis{stroke:#c9c8c3}` +
  `@media (prefers-color-scheme:dark){.s{fill:${SERIES[series][1]};stroke:${SERIES[series][1]}}.axis{stroke:#4a4a46}}</style>`

// One bar per point, a hover title on each whole column, a zero line for
// series that dip below zero (follower change).
export function barSvg(points: readonly ChartPoint[], series: Series = 'blue', width = 280, height = 44): string {
  const slot = width / Math.max(points.length, 1)
  const gap = 2
  const lo = Math.min(0, ...points.map(p => p.value))
  const hi = Math.max(0, ...points.map(p => p.value))
  const span = hi - lo || 1
  const y = (v: number) => height - ((v - lo) / span) * height
  const zero = y(0)
  const cols = points.map((p, i) => {
    const x = i * slot
    const top = Math.min(y(p.value), zero)
    const h = p.value === 0 ? 0 : Math.max(Math.abs(y(p.value) - zero), 1)
    return (
      `<g><title>${esc(p.label)}</title>` +
      `<rect x="${x.toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${height}" fill="transparent"/>` +
      `<rect class="s" stroke-width="0" x="${(x + gap / 2).toFixed(1)}" y="${top.toFixed(1)}" width="${Math.max(slot - gap, 1).toFixed(1)}" height="${h.toFixed(1)}" rx="2"/></g>`
    )
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    seriesStyle(series) +
    `<line class="axis" x1="0" x2="${width}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke-width="1"/>` +
    cols.join('') +
    '</svg>'
  )
}

// A line over a shaded area, for a running figure (follower change): one point per day, a
// hover title on each whole column, the zero line, and the last point marked.
export function lineSvg(points: readonly ChartPoint[], series: Series = 'aqua', width = 280, height = 44): string {
  const pad = 3
  const slot = width / Math.max(points.length, 1)
  const lo = Math.min(0, ...points.map(p => p.value))
  const hi = Math.max(0, ...points.map(p => p.value))
  const span = hi - lo || 1
  const y = (v: number) => pad + (height - 2 * pad) * (1 - (v - lo) / span)
  const x = (i: number) => i * slot + slot / 2
  const zero = y(0)
  const xy = points.map((p, i) => `${x(i).toFixed(1)} ${y(p.value).toFixed(1)}`)
  const line = xy.length > 1 ? `<path d="M ${xy.join(' L ')}" fill="none" class="s" stroke-width="2" style="fill:none"/>` : ''
  const area =
    xy.length > 1
      ? `<path d="M ${x(0).toFixed(1)} ${zero.toFixed(1)} L ${xy.join(' L ')} L ${x(points.length - 1).toFixed(1)} ${zero.toFixed(1)} Z" class="s" stroke-width="0" fill-opacity="0.18"/>`
      : ''
  const last = points.length > 0 ? `<circle class="s" stroke-width="0" cx="${x(points.length - 1).toFixed(1)}" cy="${y(points[points.length - 1].value).toFixed(1)}" r="3"/>` : ''
  const cols = points.map(
    (p, i) => `<g><title>${esc(p.label)}</title><rect x="${(i * slot).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${height}" fill="transparent"/></g>`,
  )
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    seriesStyle(series) +
    `<line class="axis" x1="0" x2="${width}" y1="${zero.toFixed(1)}" y2="${zero.toFixed(1)}" stroke-width="1"/>` +
    area +
    line +
    last +
    cols.join('') +
    '</svg>'
  )
}

// Whole-number shares of `total` that add up to it (largest remainder).
export function apportion(values: readonly number[], total: number): number[] {
  const sum = values.reduce((s, v) => s + v, 0)
  if (sum <= 0) return values.map(() => 0)
  const raw = values.map(v => (v / sum) * total)
  const out = raw.map(Math.floor)
  let left = total - out.reduce((s, v) => s + v, 0)
  const order = raw.map((r, i) => [r - Math.floor(r), i] as const).sort((a, b) => b[0] - a[0])
  for (const [, i] of order) {
    if (left <= 0) break
    out[i]++
    left--
  }
  return out
}

// The PD Intelligence dashboard's color for each platform, [light, dark]; the dark step only
// where the dashboard's color would vanish on a dark background (Threads, X).
const PLATFORM_COLORS: Record<string, readonly [string, string]> = {
  Instagram: ['#E1306C', '#E1306C'],
  Threads: ['#111111', '#E5E5E5'],
  Facebook: ['#1877F2', '#1877F2'],
  TikTok: ['#14A39A', '#14A39A'],
  X: ['#64748B', '#94A3B8'],
  YouTube: ['#FF0000', '#FF0000'],
  Bluesky: ['#0085FF', '#0085FF'],
}
const OTHER_COLOR = ['#8A8984', '#8A8984'] as const

export const platformColor = (platform: string, mode: 'light' | 'dark' = 'light') =>
  (PLATFORM_COLORS[platform] ?? OTHER_COLOR)[mode === 'dark' ? 1 : 0]

// A thin bar of one segment per platform, each in its dashboard color with a hover title.
export function mixSvg(parts: readonly MixPart[], width = 280, height = 6): string {
  const total = parts.reduce((s, p) => s + p.posts, 0) || 1
  const light: string[] = []
  const dark: string[] = []
  const segs: string[] = []
  let x = 0
  parts.forEach((p, i) => {
    const w = (p.posts / total) * width
    light.push(`.m${i}{fill:${platformColor(p.platform)}}`)
    dark.push(`.m${i}{fill:${platformColor(p.platform, 'dark')}}`)
    segs.push(
      `<rect class="m${i}" x="${x.toFixed(1)}" y="0" width="${Math.max(w - 2, 0.5).toFixed(1)}" height="${height}" rx="2">` +
        `<title>${esc(`${p.platform} · ${((p.posts / total) * 100).toFixed(1)}%`)}</title></rect>`,
    )
    x += w
  })
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
    `<style>${light.join('')}@media (prefers-color-scheme:dark){${dark.join('')}}</style>` +
    segs.join('') +
    '</svg>'
  )
}

export function oneLine(text: string, max: number): string {
  // Post text often arrives wrapped in its own straight quotes; drop them.
  const flat = text.replace(/\s+/g, ' ').trim().replace(/^"+|"+$/g, '').trim()
  const chars = [...flat]
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('')}…`
}

import { expect, test } from 'claude-code/testing'

import { apportion, barSvg, lineSvg, mixSvg, oneLine, platformColor, sparkline } from './charts'

test('sparkline scales between the lowest and highest value', async () => {
  expect(sparkline([0, 7, 14])).toBe('▁▅█')
  expect(sparkline([5, 5])).toBe('▄▄')
  expect(sparkline([0, 0, 0])).toBe('▁▁▁')
  expect(sparkline([])).toBe('')
})

test('a bar chart has one hover title per point, escaped, and never NaN', async () => {
  const points = Array.from({ length: 14 }, (_, i) => ({ label: `Day ${i} · <${i}> & "x"`, value: i * 3 }))
  const svg = barSvg(points)
  expect(svg.match(/<title>/g)?.length).toBe(14)
  expect(svg).toContain('<title>Day 2 · &lt;2&gt; &amp; &quot;x&quot;</title>')
  expect(svg.length).toBeLessThan(131072)
  expect(svg).not.toContain('<script')

  expect(barSvg([{ label: 'a', value: 0 }, { label: 'b', value: 0 }])).not.toContain('NaN')
  expect(barSvg([{ label: 'a', value: -40 }, { label: 'b', value: 25 }])).not.toContain('NaN')
  expect(barSvg([])).not.toContain('NaN')
})

test('shares are whole numbers that add up to the total', async () => {
  expect(apportion([93, 2], 100)).toEqual([98, 2])
  expect(apportion([1, 1, 1], 100)).toEqual([34, 33, 33])
  expect(apportion([0, 0], 100)).toEqual([0, 0])
})

test('each platform keeps the PD Intelligence dashboard color, with a dark-mode step where needed', async () => {
  expect(platformColor('Instagram')).toBe('#E1306C')
  expect(platformColor('YouTube')).toBe('#FF0000')
  expect(platformColor('Threads', 'dark')).toBe('#E5E5E5')
  expect(platformColor('Someplace New')).toBe('#8A8984')
})

test('the platform bar is one escaped segment per platform, in its own color', async () => {
  const svg = mixSvg([{ platform: 'Instagram', posts: 3 }, { platform: 'a<b', posts: 1 }])
  expect(svg).toContain('#E1306C')
  expect(svg).toContain('a&lt;b')
  expect(svg.match(/<rect /g)?.length).toBe(2)
  expect(svg).not.toContain('NaN')
})

test('post text is shown on one line, cut with an ellipsis', async () => {
  expect(oneLine('a\n\n b   <x>', 60)).toBe('a b <x>')
  expect(oneLine('"“Pro-life” - a post"', 60)).toBe('“Pro-life” - a post')
  const cut = oneLine('x'.repeat(70), 60)
  expect([...cut].length).toBe(60)
  expect(cut.endsWith('…')).toBe(true)
})

test('each series has its own color, light and dark', async () => {
  const pts = [{ label: 'a', value: 1 }, { label: 'b', value: 2 }]
  expect(barSvg(pts)).toContain('#2a78d6')
  expect(barSvg(pts, 'violet')).toContain('#4a3aa7')
  expect(barSvg(pts, 'violet')).toContain('#9085e9')
})

test('a line chart has a line, one hover title per point, and never NaN', async () => {
  const pts = Array.from({ length: 14 }, (_, i) => ({ label: `Day ${i} <`, value: i * 10 - 30 }))
  const svg = lineSvg(pts)
  expect(svg).toContain('<path')
  expect(svg).toContain('#1baf7a')
  expect(svg.match(/<title>/g)?.length).toBe(14)
  expect(svg).toContain('Day 3 &lt;')
  for (const few of [[], [{ label: 'a', value: 5 }], [{ label: 'a', value: 0 }, { label: 'b', value: 0 }]]) {
    expect(lineSvg(few)).not.toContain('NaN')
  }
})

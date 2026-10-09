import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, ResolveInput, ToolCallResult } from 'claude-code'

import type { PdDataset, PdEvidence, PdGlance, PdMetric } from '../types'

// Any tool on an MCP server whose name mentions "intel": the claude.ai
// connector (mcp__PD_Intelligence__*) or a server added by hand under its own name.
// This mod's own tools (mcp__pd-intel-code__*) are not PD Intelligence calls.
const PD_TOOL = /^mcp__(?!pd-intel-code__).*intel.*__[a-z_]+$/i
const CHOOSE_TOOL = 'mcp__pd-intel-code__choose_dataset'
// Writes that remove data or widen who can see it: always put to the person.
const CONFIRM_TOOL = /^mcp__.*intel.*__(delete_tag|delete_creators|share_document)$/i
const PD_SERVER = /^mcp__(.*intel.*)__list_datasets$/i

const ledger = atom({ plugin: 'pd-intel-code', key: 'ledger' } as const, [])
const datasets = atom({ plugin: 'pd-intel-code', key: 'datasets' } as const, null)
const pinned = atom({ plugin: 'pd-intel-code', key: 'pinned' } as const, null)
const glance = atom({ plugin: 'pd-intel-code', key: 'glance' } as const, null)
const capture = atom({ plugin: 'pd-intel-code', key: 'capture' } as const, false)
const notice = atom({ plugin: 'pd-intel-code', key: 'notice' } as const, null)
const view = atom({ plugin: 'pd-intel-code', key: 'view' } as const, 'chat')

const PANE = 'pd'

const EVIDENCE_ROOT = 'pd-intel-evidence'
// The window the panel's "change" column covers.
const GLANCE_DAYS = 7

const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  tiktok: 'TikTok',
  x_twitter: 'X',
  youtube: 'YouTube',
}

const shortName = (tool: string) => tool.slice(tool.lastIndexOf('__') + 2)

const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

function compact(n: number): string {
  // Exact below 10,000; rounded to one decimal of K, M or B above it.
  for (const [from, size, unit] of [[1e9, 1e9, 'B'], [1e6, 1e6, 'M'], [1e4, 1e3, 'K']] as const) {
    if (Math.abs(n) >= from) return `${(n / size).toFixed(1).replace(/\.0$/, '')}${unit}`
  }
  return grouped(n)
}

const label = (d: PdDataset) => `${d.icon ? `${d.icon.trim()} ` : ''}${d.name}`

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// list_datasets answers `{ result: [{ id, name, icon, ... }] }`.
function toDatasets(parsed: unknown): PdDataset[] | undefined {
  const rows = (parsed as { result?: unknown } | undefined)?.result
  if (!Array.isArray(rows)) return undefined
  return rows
    .filter(r => typeof r?.id === 'number' && typeof r?.name === 'string')
    .map(r => ({ id: r.id as number, name: r.name as string, icon: typeof r.icon === 'string' ? r.icon : '' }))
    .sort((a, b) => a.id - b.id)
}

function toGlance(datasetId: number, raw: Record<string, unknown>): PdGlance {
  const metric = (v: unknown): PdMetric => {
    const m = v as { value?: unknown; delta_label?: unknown } | undefined
    return { value: Number(m?.value ?? 0), deltaLabel: String(m?.delta_label ?? '') }
  }
  const platforms = Object.entries((raw.platforms ?? {}) as Record<string, unknown>)
    .map(([platform, v]) => ({ platform: PLATFORM_NAMES[platform] ?? platform, posts: metric(v) }))
    .sort((a, b) => b.posts.value - a.posts.value)
  return {
    datasetId,
    days: Number(raw.comparison_days ?? GLANCE_DAYS),
    posts: metric(raw.total_posts),
    views: metric(raw.total_views),
    followers: metric(raw.total_followers),
    accounts: metric(raw.total_accounts),
    activeAccounts: metric(raw.active_accounts),
    creators: metric(raw.total_creators),
    platforms,
  }
}

// The connector's server name, read off its list_datasets tool.
async function pdServer($: EngineInterface): Promise<string | undefined> {
  for (const tool of await $.tool.list()) {
    const match = tool.mcp ? PD_SERVER.exec(tool.name) : null
    if (match?.[1]) return match[1]
  }
  return undefined
}

// Calls a PD Intelligence tool for the panel itself (not the model's evidence).
async function callPd($: EngineInterface, tool: string, args?: Record<string, unknown>): Promise<unknown> {
  const server = await pdServer($)
  if (!server) {
    throw new Error('PD Intelligence is not connected. Turn on the PD Intelligence connector, then press Refresh.')
  }
  const res = await $.mcp.call(server, tool, args)
  const text = res.content.map(b => b.text ?? '').join('')
  if (res.isError) throw new Error(`PD Intelligence said: ${text.slice(0, 200)}`)
  return parseJson(text)
}

async function loadGlance($: EngineInterface, id: number) {
  const raw = await callPd($, 'get_dashboard_stats', { dataset_id: id, comparison_days: GLANCE_DAYS })
  await update($, glance, () => toGlance(id, (raw ?? {}) as Record<string, unknown>))
}

async function refresh($: EngineInterface) {
  await update($, notice, () => 'Loading your datasets…')
  try {
    const list = toDatasets(await callPd($, 'list_datasets'))
    if (list) await update($, datasets, () => list)
    const current = await read($, pinned)
    const fresh = current && list?.find(d => d.id === current.id)
    if (fresh && (fresh.name !== current.name || fresh.icon !== current.icon)) {
      await $.store.set('dataset', fresh)
      await update($, pinned, () => fresh)
      showStatus($, fresh)
    }
    if (current) await loadGlance($, current.id)
    await update($, notice, () => null)
  } catch (err) {
    await update($, notice, () => err instanceof Error ? err.message : String(err))
  }
}

function showStatus($: EngineInterface, d: PdDataset | null) {
  $.ui.status(d ? `PD Intelligence · ${label(d)}` : undefined)
}

async function pin($: EngineInterface, d: PdDataset | null) {
  if (d) await $.store.set('dataset', d)
  else await $.store.delete('dataset')
  await update($, pinned, () => d)
  await update($, glance, () => null)
  showStatus($, d)
  if (!d) return
  try {
    await loadGlance($, d.id)
  } catch (err) {
    await update($, notice, () => err instanceof Error ? err.message : String(err))
  }
}

// Pins a dataset by id, naming it from the list (loaded first if need be).
async function pinById($: EngineInterface, id: number): Promise<PdDataset> {
  let list = await read($, datasets)
  if (!list) {
    await refresh($)
    list = await read($, datasets)
  }
  const found = list?.find(d => d.id === id) ?? { id, name: `Dataset ${id}`, icon: '' }
  await pin($, found)
  return found
}

async function setCapture($: EngineInterface, on: boolean) {
  await $.store.set('capture', on)
  await update($, capture, () => on)
}

// The person's choice of where /pd shows the panel, remembered across sessions.
// Mobile places no side panel, so there the panel always draws in the chat.
async function setView($: EngineInterface, where: 'chat' | 'side') {
  await $.store.set('view', where)
  await update($, view, () => where)
  if (where === 'side') await $.ui.open({ id: PANE, title: 'PD Intelligence' })
  else await $.ui.close({ id: PANE })
}

async function evidenceDir($: EngineInterface): Promise<string> {
  const id = await $.session.id()
  return `${EVIDENCE_ROOT}/${id.slice(0, 8)}`
}

async function record($: EngineInterface, e: Record<string, unknown>, ran: ToolCallResult) {
  const { tool, tool_use_id, agentId, requestMeta, consent, ...args } = e
  const name = shortName(String(tool))
  const text = ran.text ?? ''
  const isError = ran.isError === true
  const entries = await read($, ledger)
  const entry: PdEvidence = {
    n: entries.length + 1,
    tool: name,
    args,
    at: new Date(await $.clock.now()).toISOString(),
    isError,
    chars: text.length,
  }

  if (name === 'list_datasets' && !isError) {
    const list = toDatasets(parseJson(text))
    if (list) await update($, datasets, () => list)
  }

  if (!isError && (await read($, capture))) {
    const dir = await evidenceDir($)
    if (!(await $.fs.exists(`${EVIDENCE_ROOT}/.gitignore`))) {
      // Captured results are client data: keep them out of any repo by default.
      await $.fs.write(`${EVIDENCE_ROOT}/.gitignore`, '*\n')
    }
    entry.file = `${dir}/${String(entry.n).padStart(3, '0')}-${name}.json`
    const call = { tool: name, args, at: entry.at }
    await $.fs.write(entry.file, JSON.stringify({ call, result: parseJson(text) ?? text }, null, 2) + '\n')
  }

  await update($, ledger, list => [...list, entry])
}

function formatLedger(entries: readonly PdEvidence[]): string {
  if (entries.length === 0) {
    return 'No PD Intelligence calls yet this session.'
  }
  const lines = entries.map(x => {
    const args = Object.keys(x.args).length > 0 ? ` ${JSON.stringify(x.args)}` : ''
    const status = x.isError ? ' (error)' : ''
    const file = x.file ? ` -> ${x.file}` : ''
    return `${x.n}. ${x.at} \`${x.tool}\`${args}${status}${file}`
  })
  return [`PD Intelligence calls this session (${entries.length}):`, '', ...lines].join('\n')
}

// The panel as markdown: the /pd row the model reads, and what a surface that
// draws no plugin panels (the mobile app) shows in its place.
function summary(list: readonly PdDataset[] | null, current: PdDataset | null, g: PdGlance | null): string {
  const lines = [current ? `**PD Intelligence** · working in **${label(current)}**` : '**PD Intelligence** · no dataset chosen yet']
  if (g && current && g.datasetId === current.id) {
    const m = (x: PdMetric, value: string) => `${value} (${x.deltaLabel})`
    lines.push(
      '',
      `Last ${g.days} days:`,
      `- Posts: ${m(g.posts, grouped(g.posts.value))}`,
      `- Views: ${m(g.views, compact(g.views.value))}`,
      `- Followers: ${m(g.followers, compact(g.followers.value))}`,
      `- Accounts: ${m(g.accounts, grouped(g.accounts.value))}, ${m(g.activeAccounts, grouped(g.activeAccounts.value))} posting`,
      `- Creators: ${m(g.creators, grouped(g.creators.value))}`,
    )
    if (g.platforms.length > 0) {
      lines.push(`- By platform: ${g.platforms.map(p => `${p.platform} ${compact(p.posts.value)}`).join(' · ')}`)
    }
  }
  if (list) {
    lines.push(
      '',
      '**Your datasets**',
      ...list.map(d => `- ${d.id === current?.id ? '**' : ''}${label(d)} · #${d.id}${d.id === current?.id ? '** (current)' : ''}`),
      '',
      'To switch, ask Claude ("work in ...") or type `/pd-dataset` and the number.',
    )
  }
  if (current) {
    lines.push('Next: ask Claude to explore this dataset, or type `/pd-intel-code:report` for a report.')
  }
  return lines.join('\n')
}

// The panel itself, drawn in the side panel or as /pd's row in the chat;
// `extra` is what only one of the two adds.
async function drawPanel($: EngineInterface, e: ResolveInput, extra?: JSX.Element) {
  const { Box, Text, Button } = $.ui.resolve(e)
  const list = await read($, datasets)
  const current = await read($, pinned)
  const g = await read($, glance)
  const isCapturing = await read($, capture)
  const line = await read($, notice)
  const calls = (await read($, ledger)).length
  const shown = g && current && g.datasetId === current.id ? g : null

  const row = (name: string, m: PdMetric, value: string) => (
    <Box key={name} flexDirection="row">
      <Box width={12}>
        <Text dimColor>{name}</Text>
      </Box>
      <Box width={10}>
        <Text bold>{value}</Text>
      </Box>
      <Text color={m.deltaLabel.startsWith('-') ? 'error' : 'success'}>{m.deltaLabel}</Text>
    </Box>
  )

  return (
    <Box flexDirection="column" gap={1}>
      {line && <Text color="warning">{line}</Text>}

      <Box flexDirection="column">
        <Text dimColor>Working in</Text>
        {current ? (
          <Text bold>{label(current)}</Text>
        ) : (
          <Text>No dataset chosen yet. Pick one below and Claude will use it.</Text>
        )}
      </Box>

      {shown && (
        <Box flexDirection="column">
          <Text dimColor>Change over the last {shown.days} days</Text>
          {row('Posts', shown.posts, grouped(shown.posts.value))}
          {row('Views', shown.views, compact(shown.views.value))}
          {row('Followers', shown.followers, compact(shown.followers.value))}
          {row('Accounts', shown.accounts, grouped(shown.accounts.value))}
          {row('Posting', shown.activeAccounts, grouped(shown.activeAccounts.value))}
          {row('Creators', shown.creators, grouped(shown.creators.value))}
          {shown.platforms.length > 0 && (
            <Text dimColor wrap="wrap">
              {shown.platforms.map(p => `${p.platform} ${compact(p.posts.value)}`).join(' · ')}
            </Text>
          )}
        </Box>
      )}

      {current && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Button
            key="explore"
            label="Explore this dataset"
            variant="primary"
            onPress={() => $.command.run({ command: 'pd-intel-code:explore' })}
          />
          <Button
            key="report"
            label="Write a report"
            onPress={() => $.command.run({ command: 'pd-intel-code:report' })}
          />
        </Box>
      )}

      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Button
          key="capture"
          label={`Save results for charts: ${isCapturing ? 'On' : 'Off'}`}
          onPress={() => setCapture($, !isCapturing)}
        />
        <Button
          key="sources"
          label={`Sources used (${calls})`}
          onPress={() => $.command.run({ command: 'pd-evidence' })}
        />
        <Button key="refresh" label="Refresh" onPress={() => refresh($)} />
      </Box>

      <Box flexDirection="column">
        <Text dimColor>Your datasets{list ? ` (${list.length})` : ''}: press one to work in it</Text>
        {(list ?? []).map(d => (
          <Button key={`ds-${d.id}`} plain onPress={() => pin($, d)}>
            {d.id === current?.id ? '● ' : '○ '}
            {label(d)} <Text dimColor>#{d.id}</Text>
          </Button>
        ))}
      </Box>

      {extra}
    </Box>
  )
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'pd',
      description: 'Open the PD Intelligence panel: your datasets at a glance',
    })
    await $.command.register({
      name: 'pd-dataset',
      description: 'Choose the PD Intelligence dataset Claude works in (no argument: show it)',
      argumentHint: '[ID | off]',
    })
    await $.command.register({
      name: 'pd-evidence',
      description: 'List every PD Intelligence call this session, for a report\'s sources; on/off saves raw results as JSON',
      argumentHint: '[on | off | clear]',
    })

    await $.tool.register({
      name: 'choose_dataset',
      description:
        'Switch the PD Intelligence dataset the person works in: what /pd shows and what Claude uses by default. Use when the person asks to switch to, work in, or focus on a dataset. Takes the id from list_datasets.',
      inputSchema: {
        type: 'object',
        properties: { dataset_id: { type: 'integer', description: 'The dataset id, from list_datasets.' } },
        required: ['dataset_id'],
      },
      isDeferred: false,
    })

    const saved = (await $.store.get('dataset')) as PdDataset | undefined
    await update($, pinned, () => saved ?? null)
    const isCapturing = (await $.store.get('capture')) === true
    await update($, capture, () => isCapturing)
    showStatus($, saved ?? null)
    const where = (await $.store.get('view')) === 'side' ? 'side' : 'chat'
    await update($, view, () => where)

    if ((await $.store.get('welcomed')) !== true) {
      await $.store.set('welcomed', true)
      $.ui.toast('PD Intelligence: type /pd to see your datasets at a glance')
    }
    return next(e)
  })

  // /pd answers in text (what the model reads), and the CommandOutput hook
  // below draws that row as the live panel, in the chat on every surface.
  on('command.run', { command: 'pd' }, async $ => {
    if ((await read($, view)) === 'side') await $.ui.open({ id: PANE, title: 'PD Intelligence' })
    await refresh($)
    const problem = await read($, notice)
    return { text: problem ?? summary(await read($, datasets), await read($, pinned), await read($, glance)) }
  })

  on('command.run', { command: 'pd-dataset' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === '') {
      return { text: summary(await read($, datasets), await read($, pinned), null) }
    }

    if (arg === 'off') {
      await pin($, null)
      return { text: 'No dataset chosen now.' }
    }

    if (!/^\d+$/.test(arg)) {
      return { text: 'Usage: /pd-dataset ID  (or "off"). Type /pd to see your datasets and their ids.' }
    }

    const found = await pinById($, Number(arg))
    return { text: `Working in: ${label(found)}` }
  })

  on('command.run', { command: 'pd-evidence' }, async ($, e) => {
    const arg = e.args.trim()

    if (arg === 'on' || arg === 'off') {
      await setCapture($, arg === 'on')
      return {
        text:
          arg === 'on'
            ? `Evidence capture on: PD Intelligence results are saved under ${await evidenceDir($)}/ (git-ignored).`
            : 'Evidence capture off.',
      }
    }

    if (arg === 'clear') {
      await update($, ledger, () => [])
      return { text: 'Evidence ledger cleared.' }
    }

    if (arg !== '') {
      return { text: 'Usage: /pd-evidence [on | off | clear]' }
    }

    return { text: formatLedger(await read($, ledger)) }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, ($, e) => drawPanel($, e))

  on('ui.render', { component: 'CommandOutput', props: { command: 'pd' } }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    if (e.surface === 'mobile') {
      return drawPanel($, e)
    }
    if ((await read($, view)) === 'side') {
      return (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
          <Text dimColor>PD Intelligence is open in the side panel.</Text>
          <Button key="to-chat" label="Show it here instead" onPress={() => setView($, 'chat')} />
        </Box>
      )
    }
    return drawPanel($, e, <Button key="to-side" label="Move to side panel" onPress={() => setView($, 'side')} />)
  })

  on('tool.call', { tool: CHOOSE_TOOL }, async ($, e) => {
    const id = Number((e as Record<string, unknown>).dataset_id)
    if (!Number.isInteger(id)) {
      return { deny: 'dataset_id must be a dataset id from list_datasets' }
    }
    const found = await pinById($, id)
    return { result: `Now working in ${label(found)} (dataset ${found.id}).` }
  })

  on('tool.call', { tool: PD_TOOL }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined) {
      await record($, e as Record<string, unknown>, ran)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.check', { tool: CONFIRM_TOOL }, async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'allow') {
      return verdict
    }
    return {
      decision: 'ask',
      reason: `${shortName(e.tool)} deletes PD Intelligence data or changes who can see a document`,
    }
  }).catch(() => ({ decision: 'ask' }))

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const current = await read($, pinned)
    const isCapturing = await read($, capture)
    if (!current && !isCapturing) {
      return composed
    }

    const lines = ['# PD Intelligence (pd-intel-code)']
    if (current) {
      lines.push(
        `- The person chose PD Intelligence dataset ${current.id} (${current.name}). Pass dataset_id ${current.id} to PD Intelligence tools unless they name another dataset; do not ask which dataset to use.`,
      )
    }
    if (isCapturing) {
      lines.push(
        `- Evidence capture is on: every PD Intelligence result is saved as JSON under ${await evidenceDir($)}/, numbered in call order. For charts, tables or reworking numbers in a report, load those files (e.g. with Python) instead of calling the tool again.`,
      )
    }
    lines.push(
      '- The person may not be technical: explain findings in plain language, lead with what changed and why it matters, and keep numbers rounded unless they ask for exact figures.',
    )
    return {
      sections: [...composed.sections, { id: 'pd-intel-code:context', text: lines.join('\n'), scope: 'session' }],
    }
  })
}

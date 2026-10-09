import { atom, read, update } from 'claude-code'
import type { ButtonProps, Elements, EngineInterface, Register, RenderElement, ResolveInput, ToolCallResult, UiPressArgument } from 'claude-code'

import type {
  PdAccountRef,
  PdAccountView,
  PdDataset,
  PdPostView,
  PdEvidence,
  PdScreen,
  PdSection,
  PdSnapshot,
  PdToday,
  PdTopPost,
} from '../types'
import { drawPanel as renderPanel, summary, type PanelActions, type PanelData } from './panel'
import {
  DAY_MS,
  GLANCE_DAYS,
  MCP_TOOL,
  PD_SIGNATURE,
  SECTION_KEYS,
  SERIES_DAYS,
  startRequest,
  type SectionKey,
  activitySql,
  blockedMessage,
  dayKey,
  followersSql,
  isStale,
  label,
  lastDays,
  parseJson,
  platformKey,
  pushRecent,
  requestDone,
  requestStarted,
  rowsOf,
  serverName,
  shortName,
  toAccountStats,
  toActivity,
  toAttention,
  toCommentSummary,
  toDatasets,
  toFollowers,
  toGlance,
  toPostDetail,
  toPosts,
  toSummary,
  toTopPosts,
  topPostsSql,
} from './data'

const CHOOSE_TOOL = 'mcp__pd-intel-code__choose_dataset'
// Writes that remove data or widen who can see it: always put to the person.
const CONFIRM_TOOL = /^mcp__.+__(delete_tag|delete_creators|share_document)$/
// A connector can still be connecting when Claude Code has just started: how long /pd waits.
const CONNECT_TRIES = 4
const CONNECT_WAIT_MS = 1500

const ledger = atom({ plugin: 'pd-intel-code', key: 'ledger' } as const, [])
const datasets = atom({ plugin: 'pd-intel-code', key: 'datasets' } as const, null)
const pinned = atom({ plugin: 'pd-intel-code', key: 'pinned' } as const, null)
const snapshot = atom({ plugin: 'pd-intel-code', key: 'snapshot' } as const, null)
const screen = atom({ plugin: 'pd-intel-code', key: 'screen' } as const, { kind: 'home' })
const today = atom({ plugin: 'pd-intel-code', key: 'today' } as const, null)
const postView = atom({ plugin: 'pd-intel-code', key: 'postView' } as const, null)
const accountView = atom({ plugin: 'pd-intel-code', key: 'accountView' } as const, null)
const requests = atom({ plugin: 'pd-intel-code', key: 'requests' } as const, [])
const recent = atom({ plugin: 'pd-intel-code', key: 'recent' } as const, [])
const capture = atom({ plugin: 'pd-intel-code', key: 'capture' } as const, false)
const notice = atom({ plugin: 'pd-intel-code', key: 'notice' } as const, null)
const view = atom({ plugin: 'pd-intel-code', key: 'view' } as const, 'chat')
const pdServers = atom({ plugin: 'pd-intel-code', key: 'pdServers' } as const, {})

const PANE = 'pd'

const EVIDENCE_ROOT = 'pd-intel-evidence'

// The MCP servers that carry every PD_SIGNATURE tool, from the tools connected now.
async function findPdServers($: EngineInterface): Promise<string[]> {
  const tools = new Map<string, Set<string>>()
  for (const tool of await $.tool.list()) {
    if (!tool.mcp || !MCP_TOOL.test(tool.name)) continue
    const server = serverName(tool.name)
    tools.set(server, (tools.get(server) ?? new Set()).add(shortName(tool.name)))
  }
  return [...tools].filter(([, names]) => PD_SIGNATURE.every(n => names.has(n))).map(([server]) => server)
}

// Whether a tool call went to PD Intelligence; the answer is kept per server.
async function isPdServer($: EngineInterface, server: string): Promise<boolean> {
  const known = await read($, pdServers)
  if (server in known) return known[server] === true
  const isPd = (await findPdServers($)).includes(server)
  await update($, pdServers, m => ({ ...m, [server]: isPd }))
  return isPd
}

// The PD Intelligence server, waiting a little for a connector that is still connecting.
async function pdServer($: EngineInterface): Promise<string | undefined> {
  for (let tries = 1; ; tries++) {
    const [server] = await findPdServers($)
    if (server || tries >= CONNECT_TRIES) return server
    await $.clock.sleep(CONNECT_WAIT_MS)
  }
}

// Calls a PD Intelligence tool for the panel itself (not the model's evidence).
async function callPd($: EngineInterface, tool: string, args?: Record<string, unknown>): Promise<unknown> {
  const server = await pdServer($)
  if (!server) {
    throw new Error(
      "Can't find the PD Intelligence connector. If Claude Code just started it may still be connecting: press Refresh in a few seconds. Otherwise check /mcp that PD Intelligence is connected.",
    )
  }
  let res: Awaited<ReturnType<EngineInterface['mcp']['call']>>
  try {
    res = await $.mcp.call(server, tool, args)
  } catch (err) {
    // A permission refusal reads as engine wording; say what to do instead.
    if (/\b(refused|denied|classifier|permission)/i.test(err instanceof Error ? err.message : String(err))) throw new Error(blockedMessage(tool))
    throw err
  }
  const text = res.content.map(b => b.text ?? '').join('')
  if (res.isError) throw new Error(`PD Intelligence said: ${text.slice(0, 200)}`)
  return parseJson(text)
}

const LOADING = { status: 'loading' } as const
const snapshotKey = (id: number) => `snapshot-${id}`

// The newest load; an older one's answers are dropped. Not drawn from, so a
// module variable (a reload starts it over, which only drops in-flight answers).
let latestLoad: object | null = null

// Fetches the given sections of dataset `id` at once (all by default); each lands
// as it settles, and only while this is the newest load and `id` the snapshot's dataset.
async function loadSnapshot($: EngineInterface, id: number, today: string, keys: readonly SectionKey[] = SECTION_KEYS): Promise<void> {
  if ((await read($, pinned))?.id !== id) return
  const load = {}
  latestLoad = load
  const isMine = (s: PdSnapshot | null): s is PdSnapshot => !!s && s.datasetId === id && latestLoad === load
  const days = lastDays(today)
  const from = days[0]
  const weekFrom = days[days.length - 7]
  const lookback = dayKey(Date.parse(`${from}T00:00:00Z`) - SERIES_DAYS * DAY_MS)
  const loading = Object.fromEntries(keys.map(k => [k, LOADING]))
  await update($, snapshot, s =>
    s && s.datasetId === id && keys.length < SECTION_KEYS.length
      ? ({ ...s, ...loading } as PdSnapshot)
      : ({ datasetId: id, fetchedOn: today, glance: LOADING, activity: LOADING, followers: LOADING, topPosts: LOADING, attention: LOADING } as PdSnapshot),
  )

  const sql = async (text: string, dateFrom: string) =>
    rowsOf(await callPd($, 'run_analytics_sql', { dataset_id: id, sql: text, date_from: dateFrom }))
  const jobs: Record<SectionKey, () => Promise<unknown>> = {
    glance: async () =>
      toGlance(id, ((await callPd($, 'get_dashboard_stats', { dataset_id: id, comparison_days: GLANCE_DAYS })) ?? {}) as Record<string, unknown>),
    activity: async () => toActivity(await sql(activitySql(from), from), days),
    followers: async () => toFollowers(await sql(followersSql(from, today), lookback), days),
    topPosts: async () => toTopPosts(await sql(topPostsSql(weekFrom), weekFrom)),
    attention: async () =>
      toAttention(await callPd($, 'get_leaderboard', { dataset_id: id, entity_type: 'accounts', mode: 'needs_attention', limit: 3 })),
  }

  await Promise.all(
    keys.map(async key => {
      let section: PdSection<unknown>
      try {
        section = { status: 'ready', data: await jobs[key]() }
      } catch (err) {
        section = { status: 'failed', message: err instanceof Error ? err.message : String(err) }
      }
      await update($, snapshot, s => (isMine(s) ? ({ ...s, [key]: section } as PdSnapshot) : s))
    }),
  )

  const done = await read($, snapshot)
  if (isMine(done)) await $.store.set(snapshotKey(id), done)
}

// Shows dataset `id`'s saved snapshot, unless the one held already is its own.
async function showSaved($: EngineInterface, id: number): Promise<PdSnapshot | null> {
  const held = await read($, snapshot)
  if (held && held.datasetId === id) return held
  const saved = ((await $.store.get(snapshotKey(id))) as PdSnapshot | undefined) ?? null
  if ((await read($, pinned))?.id === id) await update($, snapshot, () => saved)
  return saved
}

// Shows dataset `id`'s saved snapshot at once; fetches it all again when it is from
// an earlier day or `force` is set, and only its unready sections otherwise.
async function ensureSnapshot($: EngineInterface, id: number, force = false): Promise<void> {
  const today = dayKey(await $.clock.now())
  const snap = await showSaved($, id)
  if (force || !snap || snap.fetchedOn < today) return loadSnapshot($, id, today)
  if (isStale(snap, today)) await loadSnapshot($, id, today, SECTION_KEYS.filter(k => snap[k].status !== 'ready'))
}

// A loader's answer as a panel section: ready with its data, or failed with why.
async function settle<T>(job: () => Promise<T>): Promise<PdSection<T>> {
  try {
    return { status: 'ready', data: await job() }
  } catch (err) {
    return { status: 'failed', message: err instanceof Error ? err.message : String(err) }
  }
}

const todayKey = (id: number) => `today-${id}`

// Today's brief for dataset `id`: PD's daily summary, then that day's top posts by views.
// Kept for the UTC day like the snapshot; answers for another dataset are dropped.
async function ensureToday($: EngineInterface, id: number, force = false): Promise<void> {
  const day = dayKey(await $.clock.now())
  let held = await read($, today)
  if (!held || held.datasetId !== id) {
    held = ((await $.store.get(todayKey(id))) as PdToday | undefined) ?? null
    await update($, today, () => held)
  }
  if (!force && held && held.fetchedOn === day && held.summary.status === 'ready' && held.posts.status === 'ready') return
  await update($, today, () => ({ datasetId: id, fetchedOn: day, summary: LOADING, posts: LOADING }))
  const mine = (s: PdToday | null): s is PdToday => !!s && s.datasetId === id
  let date = day
  const summary = await settle(async () => {
    const s = toSummary(await callPd($, 'get_daily_summary', { dataset_id: id }))
    date = s.date || day
    return s
  })
  await update($, today, s => (mine(s) ? { ...s, summary } : s))
  const posts = await settle(async () =>
    toPosts(await callPd($, 'search_posts', { dataset_id: id, date_from: date, date_to: date, sort_by: 'views', sort_order: 'desc', page_size: 5 })),
  )
  await update($, today, s => (mine(s) ? { ...s, posts } : s))
  const done = await read($, today)
  if (mine(done)) await $.store.set(todayKey(id), done)
}

// Moves the panel to a screen and starts what it needs.
async function show($: EngineInterface, s: PdScreen): Promise<void> {
  await update($, screen, () => s)
  const current = await read($, pinned)
  if (s.kind === 'today' && current) await ensureToday($, current.id)
  if (s.kind === 'post') await loadPost($, s.post)
  if (s.kind === 'account') await loadAccount($, s.account)
}

// Refresh reloads what is on screen: Today, the open post or account, or the overview.
async function refreshScreen($: EngineInterface): Promise<void> {
  const s = await read($, screen)
  const current = await read($, pinned)
  if (s.kind === 'today' && current) return ensureToday($, current.id, true)
  if (s.kind === 'post') return loadPost($, s.post)
  if (s.kind === 'account') return loadAccount($, s.account)
  return refresh($, true)
}

// Hands a request to Claude as the person's own message, and tracks it in the panel.
async function ask($: EngineInterface, text: string, label: string): Promise<void> {
  const at = new Date(await $.clock.now()).toISOString()
  const id = `${at}-${(await read($, requests)).length}`
  await update($, requests, list => startRequest(list, { id, label, text, status: 'sent', at }))
  void $.prompt.submit({ text, asUser: true })
}

// One post's numbers; the comment summary waits for loadComments (it can take minutes).
async function loadPost($: EngineInterface, post: PdTopPost): Promise<void> {
  const current = await read($, pinned)
  if (!current || post.id === undefined) return
  const postId = post.id
  const datasetId = current.id
  await update($, postView, () => ({ datasetId, postId, detail: LOADING, comments: null }))
  const detail = await settle(async () => toPostDetail(await callPd($, 'get_post_detail', { dataset_id: datasetId, post_id: postId })))
  await update($, postView, v => (v && v.postId === postId && v.datasetId === datasetId ? { ...v, detail } : v))
}

async function loadComments($: EngineInterface): Promise<void> {
  const current = await read($, pinned)
  const held = await read($, postView)
  if (!current || !held) return
  const { postId, datasetId } = held
  if (datasetId !== current.id) return
  const mine = (v: PdPostView | null): v is PdPostView => !!v && v.postId === postId && v.datasetId === datasetId
  await update($, postView, v => (mine(v) ? { ...v, comments: LOADING } : v))
  const comments = await settle(async () =>
    toCommentSummary(await callPd($, 'get_comment_summary', { dataset_id: datasetId, post_id: postId })),
  )
  await update($, postView, v => (mine(v) ? { ...v, comments } : v))
}

// One account's numbers and its latest posts on that platform.
async function loadAccount($: EngineInterface, ref: PdAccountRef): Promise<void> {
  const current = await read($, pinned)
  if (!current) return
  const key = `${ref.platform}:${ref.username}`
  const datasetId = current.id
  // Filtered to the account's platform: a common handle's look-alikes would otherwise fill the page.
  const filter = { dataset_id: datasetId, search: ref.username, platform: platformKey(ref.platform), page_size: 100 }
  await update($, accountView, () => ({ datasetId, key, stats: LOADING, recent: LOADING }))
  const mine = (v: PdAccountView | null): v is PdAccountView => !!v && v.key === key && v.datasetId === datasetId
  const stats = await settle(async () => toAccountStats(await callPd($, 'search_accounts', filter), ref))
  await update($, accountView, v => (mine(v) ? { ...v, stats } : v))
  const recent = await settle(async () =>
    toPosts(await callPd($, 'search_posts', { ...filter, sort_by: 'post_timestamp', sort_order: 'desc' }))
      .filter(p => p.platform === ref.platform && p.author.toLowerCase() === ref.username.toLowerCase())
      .slice(0, 5),
  )
  await update($, accountView, v => (mine(v) ? { ...v, recent } : v))
}

// `withSnapshot` false only lists the datasets (pinById, about to pin another).
async function refresh($: EngineInterface, force = false, withSnapshot = true) {
  const pinnedNow = await read($, pinned)
  if (pinnedNow && withSnapshot) await showSaved($, pinnedNow.id)
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
    await update($, notice, () => null)
    if (current && withSnapshot) await ensureSnapshot($, current.id, force)
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
  await update($, screen, () => ({ kind: 'home' }) as PdScreen)
  if (d) {
    const ids = pushRecent(await read($, recent), d.id)
    await $.store.set('recentDatasets', ids)
    await update($, recent, () => ids)
  }
  showStatus($, d)
  if (!d) {
    await update($, snapshot, () => null)
    return
  }
  await ensureSnapshot($, d.id)
}

// Pins a dataset by id, naming it from the list (loaded first if need be).
async function pinById($: EngineInterface, id: number): Promise<PdDataset> {
  let list = await read($, datasets)
  if (!list) {
    await refresh($, false, false)
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

// The desktop's first click on the side panel, while another place holds the keys, only
// moves the focus onto the Button (ui.focus) and never presses it. The panel presses it
// itself, by the closures its latest drawing gave each key. Module variables, as only
// the drawing that is up matters: a reload starts them over.
let paneFocused = false
let paneButtons = new Map<string, (e: UiPressArgument) => void>()
let clickPressed: { key: string; at: number } | null = null
// A press for the same key this soon after the panel pressed it is that click's own.
const CLICK_PRESS_MS = 1000

// The element table, its Buttons noting their closures in `into`.
function noteButtons(els: Elements[keyof Elements], into: Map<string, (e: UiPressArgument) => void>): Elements[keyof Elements] {
  const Button = els.Button as (props: ButtonProps) => RenderElement
  const noted = (props: ButtonProps) => {
    into.set(props.key ?? props.label ?? '', props.onPress)
    return Button(props)
  }
  return { ...els, Button: noted } as Elements[keyof Elements]
}

// The panel itself, drawn in the side panel or as /pd's row in the chat;
// `extra` is what only one of the two adds, `buttons` collects the side panel's.
async function drawPanel($: EngineInterface, e: ResolveInput, extra?: JSX.Element, buttons?: Map<string, (e: UiPressArgument) => void>) {
  const current = await read($, pinned)
  const held = await read($, snapshot)
  const data: PanelData = {
    list: await read($, datasets),
    current,
    snap: held && current && held.datasetId === current.id ? held : null,
    isCapturing: await read($, capture),
    line: await read($, notice),
    calls: (await read($, ledger)).length,
    screen: await read($, screen),
    today: await read($, today),
    postView: await read($, postView),
    accountView: await read($, accountView),
    requests: await read($, requests),
    recent: await read($, recent),
  }
  const actions: PanelActions = {
    pin: d => pin($, d),
    refresh: () => refreshScreen($),
    setCapture: on => setCapture($, on),
    ask: (text, label) => ask($, text, label),
    run: command => $.command.run({ command }),
    show: s => show($, s),
    back: () => show($, { kind: 'home' }),
    loadComments: () => loadComments($),
  }
  const els = $.ui.resolve(e)
  return renderPanel(buttons ? noteButtons(els, buttons) : els, e.surface, data, actions, extra)
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
    const recentIds = ((await $.store.get('recentDatasets')) as number[] | undefined) ?? []
    await update($, recent, () => recentIds)
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
    return { text: problem ?? summary(await read($, datasets), await read($, pinned), await read($, snapshot)) }
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

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    paneFocused = e.props.isFocused
    const buttons = new Map<string, (e: UiPressArgument) => void>()
    const tree = await drawPanel($, e, undefined, buttons)
    paneButtons = buttons
    return tree
  })

  // A person's focus landing on a Button while the panel did not hold the keys is a click (Tab
  // moves only within a panel that holds them): press it, as the desktop did not.
  on('ui.focus', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const wasFocused = paneFocused
    const moved = await next(e)
    const press = e.element === undefined ? undefined : paneButtons.get(e.element)
    if (moved.deny === undefined && !wasFocused && e.origin.kind === 'person' && e.element !== undefined && press) {
      paneFocused = true
      clickPressed = { key: e.element, at: await $.clock.now() }
      press({ plugin: 'pd-intel-code', element: e.element, component: 'Pane', requestId: PANE, surface: 'desktop' })
    }
    return moved
  }).catch(($, e, next) => next(e))

  on('ui.press', { component: 'Pane', requestId: PANE }, async ($, e, next) => {
    const pressed = clickPressed
    clickPressed = null
    if (pressed && pressed.key === e.element && (await $.clock.now()) - pressed.at < CLICK_PRESS_MS) return { element: e.element }
    return next(e)
  }).catch(($, e, next) => next(e))

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

  on('tool.call', { tool: MCP_TOOL }, async ($, e, next) => {
    const ran = await next(e)
    if (ran.deny === undefined && (await isPdServer($, serverName(e.tool)))) {
      await record($, e as Record<string, unknown>, ran)
    }
    return ran
  }).catch(($, e, next) => next(e))

  on('tool.check', { tool: CONFIRM_TOOL }, async ($, e, next) => {
    const verdict = await next(e)
    if (verdict.decision !== 'allow' || !(await isPdServer($, serverName(e.tool)))) {
      return verdict
    }
    return {
      decision: 'ask',
      reason: `${shortName(e.tool)} deletes PD Intelligence data or changes who can see a document`,
    }
  }).catch(() => ({ decision: 'ask' }))

  // Claude's turns, matched to the requests the panel sent: by text when one starts, then by turn id.
  on('turn.start', async ($, e, next) => {
    await update($, requests, list => requestStarted(list, e.text, e.turnId))
    return next(e)
  }).catch(($, e, next) => next(e))

  on('turn.complete', async ($, e, next) => {
    if (e.agentId === undefined) {
      const stopped = e.isAborted || e.reason === 'error' || e.reason === 'refusal'
      await update($, requests, list => requestDone(list, e.turnId, e.answer, stopped))
    }
    return next(e)
  }).catch(($, e, next) => next(e))

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

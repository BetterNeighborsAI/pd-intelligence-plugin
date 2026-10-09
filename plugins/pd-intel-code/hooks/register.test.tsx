import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SERVER = 'PD_Intelligence'
const SEARCH = `mcp__${SERVER}__search_posts`
const DELETE = `mcp__${SERVER}__delete_tag`
const DATASETS = JSON.stringify({
  result: [
    { id: 16, name: 'Example Campaign', icon: '📈' },
    { id: 3, name: 'Another Dataset', icon: '🌱' },
  ],
})
const STATS = JSON.stringify({
  total_posts: { value: 79986, delta_label: '+4,667' },
  total_views: { value: 7998171006, delta_label: '+5.8%' },
  total_followers: { value: 118275630, delta_label: '+0.1%' },
  total_accounts: { value: 163, delta_label: '+1' },
  active_accounts: { value: 112, delta_label: '-8' },
  total_creators: { value: 121, delta_label: '+1' },
  platforms: { x_twitter: { value: 75165, delta_label: '+4,250' }, youtube: { value: 921, delta_label: '+72' } },
  comparison_days: 7,
})
const ACTIVITY = JSON.stringify({
  columns: ['day', 'platform', 'posts', 'accounts'],
  rows: [
    ['2026-10-08T00:00:00', 'x_twitter', 40, 9],
    ['2026-10-09T00:00:00', 'x_twitter', 53, 11],
    ['2026-10-09T00:00:00', 'youtube', 2, 1],
  ],
})
const FOLLOWERS = JSON.stringify({
  columns: ['day', 'followers'],
  rows: [['2026-10-08T00:00:00', 1000], ['2026-10-09T00:00:00', 1250]],
})
const topOf = (id: string, author: string) =>
  JSON.stringify({
    columns: ['id', 'post_id', 'platform', 'author_username', 'text', 'views', 'content_type'],
    rows: [[id === 'p1' ? 1001 : 3003, id, 'x_twitter', author, 'Big\nnews today', 1200000, 'video']],
  })
const POST_DETAIL = JSON.stringify({ views: 1200000, likes: 5000, comments: 1863, shares: 12, engagement_rate: 4.2, post_timestamp: '2026-10-06T13:46:21Z', post_url: 'https://x.com/alice/p1', content_type: 'video' })
const COMMENTS = JSON.stringify({ summary_stats: { total_comments: 42, total_commenters: 40, author_reply_count: 0 }, timeline: [{ date: '2026-10-08', count: 29 }] })
const ACCOUNTS = JSON.stringify({
  items: [{ author_username: 'quietacct', platform: 'instagram', followers_count: 3, total_posts: 53, total_views: 2245, total_likes: 10, total_comments: 2, engagement_rate: 0.5, first_post: '2025-07-25T15:07:49Z', last_post: '2026-10-08T19:10:52Z', active_days: 53 }],
})
const ACCOUNT_POSTS = JSON.stringify({
  items: [{ id: 777, post_id: 'p777', platform: 'instagram', author_username: 'quietacct', post_text: 'Coupons carousel', views: 0, content_type: 'sidecar' }],
})
const WEAK = JSON.stringify({
  result: [{ author_username: 'quietacct', platform: 'instagram', total_posts: 53, total_views: 2245, total_likes: -53, engagement_rate: -0.27 }],
})

const SUMMARY = JSON.stringify({ narrative_text: '## Biggest stories\n\n[@carol](https://x/c) led the day.', summary_date: '2026-10-08' })
const DAY_POSTS = JSON.stringify({
  items: [{ id: 501, post_id: 'p501', platform: 'instagram', author_username: 'carol', post_text: 'Day winner', views: 9000, content_type: 'video' }],
  total: 1,
})

type Reply = (tool: string, args: Record<string, unknown>) => string | { error: string } | Promise<string | { error: string }>

// What PD Intelligence answers each panel call with; dataset 3's top post differs.
const answer: Reply = (tool, args) => {
  if (tool === 'list_datasets') return DATASETS
  if (tool === 'get_leaderboard') return WEAK
  if (tool === 'run_analytics_sql') {
    const sql = String(args.sql)
    if (sql.includes('account_metrics')) return FOLLOWERS
    if (sql.includes('post_metrics_latest')) return args.dataset_id === 3 ? topOf('p3', 'bob') : topOf('p1', 'alice')
    return ACTIVITY
  }
  if (tool === 'get_daily_summary') return SUMMARY
  if (tool === 'get_post_detail') return POST_DETAIL
  if (tool === 'get_comment_summary') return COMMENTS
  if (tool === 'search_accounts') return ACCOUNTS
  if (tool === 'search_posts' && args.search) return ACCOUNT_POSTS
  if (tool === 'search_posts') return DAY_POSTS
  return STATS
}
const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const
const SIDE = { component: 'Pane', requestId: 'pd', props: { title: 'PD Intelligence', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const
const PANEL = { component: 'CommandOutput', props: { command: 'pd', args: '', text: '', isErrored: false } } as const

// A slash command as the person types it.
const typed = (command: string, args = '') =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } }) as const

// The tools a connected server lists, as $.tool.list answers them.
const toolsOf = (server: string, names: readonly string[]) =>
  names.map(name => ({ name: `mcp__${server}__${name}`, description: '', mcp: true }))
const PD_TOOLS = ['list_datasets', 'get_dashboard_stats', 'search_posts', 'delete_tag'] as const

// A chart the panel drew, found by what it shows: an Svg by its alt text, the terminal's sparkline by its bars.
type Found = { type: string; text: string; props: Record<string, unknown> }
const svgChart = async (ui: { findAll: (q: { type: string }) => Promise<Found[]> }, alt: RegExp) =>
  (await ui.findAll({ type: 'Svg' })).find(el => alt.test(String(el.props.alt)))

// The connector, as the engine's tool list and MCP client would answer.
function connector(on: On, saved: Record<string, unknown> = {}, server = SERVER, reply: Reply = answer, statuses: (string | undefined)[] = []) {
  mock.store(on, saved)
  const clock = mock.clock(on, { now: Date.UTC(2026, 9, 9, 15) })
  on('tool.list', () => ({ value: [...toolsOf(server, PD_TOOLS), ...toolsOf('github', ['get_me', 'list_datasets'])] }))
  on('mcp.call', async ($, e) => {
    const out = await reply(e.tool, e.args)
    return typeof out === 'string'
      ? { value: { content: [{ type: 'text', text: out }], isError: false } }
      : { value: { content: [{ type: 'text', text: out.error }], isError: true } }
  })
  on('ui.status', ($, e) => {
    statuses.push(e.text)
    return { value: undefined }
  })
  return clock
}

test('the panel lists datasets; pressing one pins it, shows its numbers and reaches the prompt', async ($, on) => {
  connector(on)
  on('prompt.compose', () => ({ sections: [] }))
  await $.command.run(typed('pd'))

  const first = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'terminal', ...PANEL })
  expect(await first.find({ text: /No dataset chosen yet/ })).toBeDefined()
  expect(await first.find({ key: 'explore' })).toBeUndefined()
  await first.select({ key: 'dataset', value: '16' })
  await first.unmount()

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface, ...PANEL })
    expect(await ui.find({ text: '79,986' })).toBeDefined()
    expect(await ui.find({ text: /Views 8B \(\+5\.8%\)/ })).toBeDefined()
    expect(await ui.find({ text: '98.8%' })).toBeDefined()
    expect(await ui.find({ text: '75.2K' })).toBeDefined()
    expect(await ui.find({ key: 'explore' })).toBeDefined()
    expect(await ui.find({ key: surface === 'mobile' ? 'ds-3' : 'dataset' })).toBeDefined()
    await ui.unmount()
  }

  const { sections } = await $.prompt.compose(COMPOSE)
  expect(sections.at(-1)?.text).toContain('dataset_id 16')

  await $.command.run(typed('pd-dataset', 'off'))
  expect((await $.prompt.compose(COMPOSE)).sections).toEqual([])
})

test('people choose side panel or chat; mobile always draws in the chat', async ($, on) => {
  connector(on)
  const panes: string[] = []
  on('ui.open', ($, e) => {
    panes.push(`open ${e.id}`)
    return { value: { isPlaced: true } }
  })
  on('ui.close', ($, e) => {
    panes.push(`close ${e.id}`)
    return { value: undefined }
  })
  await $.command.run(typed('pd'))

  const chat = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await chat.press({ key: 'to-side' })
  expect(panes).toEqual(['open pd'])
  expect(await chat.find({ key: 'to-chat' })).toBeDefined()
  expect(await chat.find({ key: 'dataset' })).toBeUndefined()

  const side = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...SIDE })
  expect(await side.find({ key: 'dataset' })).toBeDefined()

  const phone = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'mobile', ...PANEL })
  expect(await phone.find({ key: 'ds-3' })).toBeDefined()
  expect(await phone.find({ key: 'to-side' })).toBeUndefined()

  await $.command.run(typed('pd'))
  expect(panes).toEqual(['open pd', 'open pd'])

  await chat.press({ key: 'to-chat' })
  expect(panes.at(-1)).toBe('close pd')
  expect(await chat.find({ key: 'dataset' })).toBeDefined()
})

test('the connector is found by its tools, whatever it is named', async ($, on) => {
  connector(on, {}, 'pdhq')
  on('tool.call', { tool: 'mcp__pdhq__search_posts' }, () => ({ result: '{"result":[]}', text: '{"result":[]}' }))
  on('tool.check', () => ({ decision: 'allow' }))

  expect((await $.command.run(typed('pd'))).text).toContain('- 📈 Example Campaign · #16')
  await $.tool.call({ tool: 'mcp__pdhq__search_posts', dataset_id: 16 })
  expect((await $.command.run(typed('pd-evidence'))).text).toContain('`search_posts` {"dataset_id":16}')
  expect((await $.tool.check({ tool: 'mcp__pdhq__delete_tag', input: { tag_id: 1 } })).decision).toBe('ask')
})

test('/pd waits for a connector that is still connecting', async ($, on) => {
  mock.store(on)
  let lists = 0
  on('tool.list', () => ({ value: ++lists < 3 ? [] : toolsOf(SERVER, PD_TOOLS) }))
  on('clock.sleep', () => ({ value: undefined }))
  on('mcp.call', () => ({ value: { content: [{ type: 'text', text: DATASETS }], isError: false } }))

  expect((await $.command.run(typed('pd'))).text).toContain('- 🌱 Another Dataset · #3')
})

test('the panel says plainly when the connector is missing', async ($, on) => {
  mock.store(on)
  on('tool.list', () => ({ value: [] }))
  on('clock.sleep', () => ({ value: undefined }))
  await $.command.run(typed('pd'))

  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'terminal', ...PANEL })
  expect(await ui.find({ text: /Can't find the PD Intelligence connector/ })).toBeDefined()
})

test('/pd also answers in text, which the model reads', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd-dataset', '16'))

  const { text } = await $.command.run(typed('pd'))
  expect(text).toContain('working in **📈 Example Campaign**')
  expect(text).toContain('- Posts: 79,986 (+4,667)')
  expect(text).toContain('- 🌱 Another Dataset · #3')
})

test('asking Claude to switch datasets pins it through choose_dataset', async ($, on) => {
  connector(on)
  const { result } = await $.tool.call({ tool: 'mcp__pd-intel-code__choose_dataset', dataset_id: 3 })
  expect(result).toBe('Now working in 🌱 Another Dataset (dataset 3).')
  expect((await $.command.run(typed('pd-dataset'))).text).toContain('working in **🌱 Another Dataset**')
  // The mod's own tool is not a PD Intelligence call for the sources list.
  expect((await $.command.run(typed('pd-evidence'))).text).toBe('No PD Intelligence calls yet this session.')
})

test('a pin saved without its name gets the name back on refresh', async ($, on) => {
  connector(on, { dataset: { id: 3, name: 'Dataset 3', icon: '' } })
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__pd-intel-code__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
  expect((await $.command.run(typed('pd'))).text).toContain('working in **🌱 Another Dataset**')
})

test('every PD call lands in the evidence ledger; other tools do not', async ($, on) => {
  connector(on)
  on('tool.call', { tool: SEARCH }, () => ({ result: '{"result":[]}', text: '{"result":[]}' }))
  on('tool.call', { tool: 'mcp__github__get_me' }, () => ({ result: 'me', text: 'me' }))

  await $.tool.call({ tool: SEARCH, dataset_id: 16, query: 'tariffs' })
  await $.tool.call({ tool: 'mcp__github__get_me' })

  const { text } = await $.command.run(typed('pd-evidence'))
  expect(text).toContain('PD Intelligence calls this session (1)')
  expect(text).toContain('`search_posts` {"dataset_id":16,"query":"tariffs"}')

  await $.command.run(typed('pd-evidence', 'clear'))
  expect((await $.command.run(typed('pd-evidence'))).text).toBe('No PD Intelligence calls yet this session.')
})

test('with capture on, raw results are written as git-ignored JSON', async ($, on) => {
  connector(on)
  const written: Record<string, string> = {}
  on('fs.exists', () => ({ value: false }))
  on('fs.write', ($, e) => {
    // Paths reach the engine resolved against the session's working directory.
    written[e.path.slice(e.path.indexOf('pd-intel-evidence/'))] = e.text
    return { value: undefined }
  })
  on('session.id', () => ({ value: 'abcdef1234567890' }))
  on('tool.call', { tool: SEARCH }, () => ({ result: '{"result":[1]}', text: '{"result":[1]}' }))

  await $.command.run(typed('pd-evidence', 'on'))
  await $.tool.call({ tool: SEARCH, dataset_id: 16 })

  expect(written['pd-intel-evidence/.gitignore']).toBe('*\n')
  const saved = JSON.parse(written['pd-intel-evidence/abcdef12/001-search_posts.json'] ?? '{}')
  expect(saved.call.args).toEqual({ dataset_id: 16 })
  expect(saved.result).toEqual({ result: [1] })
})

test('destructive writes are put to the person even when a rule allows them', async ($, on) => {
  connector(on)
  on('tool.check', () => ({ decision: 'allow' }))

  expect((await $.tool.check({ tool: DELETE, input: { dataset_id: 16, tag_id: 1 } })).decision).toBe('ask')
  expect((await $.tool.check({ tool: SEARCH, input: { dataset_id: 16 } })).decision).toBe('allow')
  // Another server's tool of the same name is not PD's to guard.
  expect((await $.tool.check({ tool: 'mcp__github__delete_tag', input: {} })).decision).toBe('allow')
})

test('a snapshot is reused the same day, kept across switches, fetched again the next day and on Refresh', async ($, on) => {
  let sqlCalls = 0
  const clock = connector(on, {}, SERVER, (tool, args) => {
    if (tool === 'run_analytics_sql') sqlCalls++
    return answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  expect(sqlCalls).toBe(3)

  await $.command.run(typed('pd'))
  expect(sqlCalls).toBe(3)

  // Back to 16 the same day: drawn from what was saved, not fetched again.
  await $.command.run(typed('pd-dataset', '3'))
  await $.command.run(typed('pd-dataset', '16'))
  expect(sqlCalls).toBe(6)

  await clock.set(Date.UTC(2026, 9, 10, 9))
  await $.command.run(typed('pd'))
  expect(sqlCalls).toBe(9)

  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'terminal', ...PANEL })
  await ui.press({ key: 'refresh' })
  expect(sqlCalls).toBe(12)
})

test('a section that failed is fetched again on the next /pd the same day', async ($, on) => {
  let failing = true
  let followerCalls = 0
  connector(on, {}, SERVER, (tool, args) => {
    if (!String(args.sql ?? '').includes('account_metrics')) return answer(tool, args)
    followerCalls++
    return failing ? { error: 'sandbox timeout' } : answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  expect(followerCalls).toBe(1)

  failing = false
  await $.command.run(typed('pd'))
  expect(followerCalls).toBe(2)

  await $.command.run(typed('pd'))
  expect(followerCalls).toBe(2)
})

test("a dataset switched mid-load never shows the earlier dataset's answers", async ($, on) => {
  const clock = connector(on, {}, SERVER, async (tool, args) => {
    if (args.dataset_id !== 16) return answer(tool, args)
    await clock.sleep(1000)
    return tool === 'get_dashboard_stats'
      ? JSON.stringify({ ...JSON.parse(STATS), total_posts: { value: 11111, delta_label: '+1' } })
      : answer(tool, args)
  })
  const first = $.command.run(typed('pd-dataset', '16'))
  await clock.settle()
  await $.command.run(typed('pd-dataset', '3'))
  await clock.advance(1000)
  await first

  const { text } = await $.command.run(typed('pd'))
  expect(text).toContain('working in **🌱 Another Dataset**')
  expect(text).toContain('- Posts: 79,986')
  expect(text).not.toContain('11,111')
})

test('the control center draws every section, with charts that suit the surface', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd-dataset', '16'))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface, ...PANEL })
    expect(await ui.find({ text: '118.3M' })).toBeDefined()
    expect(await ui.find({ text: '1. @alice' })).toBeDefined()
    expect(await ui.find({ text: 'X · 1.2M views' })).toBeDefined()
    expect(await ui.find({ text: 'Big news today' })).toBeDefined()
    expect(await ui.find({ text: '@quietacct' })).toBeDefined()
    expect(await ui.find({ text: '53 posts · 2,245 views' })).toBeDefined()
    expect(await ui.find({ key: 'why-p1' })).toBeDefined()
    expect(await ui.find({ key: 'look-quietacct' })).toBeDefined()
    // Each tile is its own card, titled plainly, with a caption saying what its chart shows.
    expect((await ui.find({ key: 'posts' }))?.props.borderStyle).toBe('round')
    expect(await ui.find({ text: 'POSTS' })).toBeDefined()
    expect(await ui.find({ text: 'posts per day · Sep 26 – Oct 9' })).toBeDefined()
    expect(await ui.find({ text: 'followers gained since Oct 8' })).toBeDefined()
    expect(await ui.find({ text: 'accounts posting per day · Sep 26 – Oct 9' })).toBeDefined()
    if (surface === 'terminal') {
      expect(await ui.find({ type: 'Svg' })).toBeUndefined()
      const bars = (await ui.findAll({ type: 'Text' })).filter(el => /^[▁▂▃▄▅▆▇█]+$/.test(el.text))
      // Posts and accounts span 14 days, followers only the days with history (2 here),
      // then the platform bar: X's 32 cells (YouTube's share rounds to none).
      expect(bars.map(el => [...el.text].length)).toEqual([14, 2, 14, 32])
    } else {
      expect(String((await svgChart(ui, /^Posts per day/))?.props.source)).toContain('<title>Oct 9 (so far) · 55 posts</title>')
      expect(String((await svgChart(ui, /^Followers gained/))?.props.source)).toContain('<title>Oct 9 (so far) · +250 since Oct 8</title>')
      // Told apart at a glance: each metric its own color, followers a line rather than bars.
      expect(String((await svgChart(ui, /^Posts per day/))?.props.source)).toContain('#2a78d6')
      expect(String((await svgChart(ui, /^Followers gained/))?.props.source)).toMatch(/<path[^>]*#1baf7a|#1baf7a[\s\S]*<path/)
      expect(String((await svgChart(ui, /^Accounts posting/))?.props.source)).toContain('#4a3aa7')
    }
    await ui.unmount()
  }
})

test('one failing call fails only its own section', async ($, on) => {
  connector(on, {}, SERVER, (tool, args) =>
    String(args.sql ?? '').includes('account_metrics') ? { error: 'sandbox timeout' } : answer(tool, args),
  )
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  expect(await ui.find({ text: "Couldn't load this: PD Intelligence said: sandbox timeout" })).toBeDefined()
  expect(await svgChart(ui, /^Posts per day/)).toBeDefined()
  expect(await svgChart(ui, /^Followers gained/)).toBeUndefined()
  expect(await ui.find({ key: 'why-p1' })).toBeDefined()
})

test('buttons hand Claude a ready-written request, as the person', async ($, on) => {
  connector(on)
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'why-p1' })
  await ui.press({ key: 'look-quietacct' })
  expect(sent).toEqual([
    'Why did this post do so well? Deep-dive post p1 (@alice on X) in Example Campaign (#16).',
    'Look into why @quietacct is underperforming in Example Campaign (#16).',
  ])
})

test('the dropdown switches dataset; the phone keeps a list of buttons', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd'))
  const desk = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await desk.select({ key: 'dataset', value: '3' })
  expect((await $.command.run(typed('pd-dataset'))).text).toContain('working in **🌱 Another Dataset**')

  const phone = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'mobile', ...PANEL })
  expect(await phone.find({ type: 'Select' })).toBeUndefined()
  expect(await phone.find({ key: 'ds-16' })).toBeDefined()
})

test('empty weeks and missing follower history are said in words', async ($, on) => {
  connector(on, {}, SERVER, (tool, args) => {
    if (tool !== 'run_analytics_sql') return answer(tool, args)
    const sql = String(args.sql)
    if (sql.includes('account_metrics')) return JSON.stringify({ columns: ['day', 'followers'], rows: [] })
    const columns = sql.includes('post_metrics_latest')
      ? ['post_id', 'platform', 'author_username', 'text', 'views']
      : ['day', 'platform', 'posts', 'accounts']
    return JSON.stringify({ columns, rows: [] })
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  expect(await ui.find({ text: 'No posts in the last 7 days.' })).toBeDefined()
  expect(await ui.find({ text: 'No follower history yet.' })).toBeDefined()
  const posts = await svgChart(ui, /^Posts per day/)
  expect(String(posts?.props.source)).toContain('<svg')
  expect(String(posts?.props.source)).not.toContain('NaN')
})

test('/pd in text carries the trend, top posts and accounts needing attention', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd-dataset', '16'))
  const { text } = await $.command.run(typed('pd'))
  expect(text).toContain('- Posts per day, last 14 days: 0 to 55, 55 so far today')
  expect(text).toContain('1. @alice on X: "Big news today" (1.2M views, post p1)')
  expect(text).toContain('- @quietacct (Instagram): 53 posts, 2,245 views')
})

// Starts a session the way Claude Code does, so the plugin restores what it saved.
async function startSession($: Parameters<Parameters<typeof test>[1]>[0], on: On) {
  on('command.register', ($, e) => ({ value: { command: e.name } }))
  on('tool.register', ($, e) => ({ value: { tool: `mcp__pd-intel-code__${e.name}` } }))
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/w', surface: null, isInteractive: false })
}

const READY_SNAPSHOT = {
  datasetId: 16,
  fetchedOn: '2026-10-09',
  glance: { status: 'ready', data: { datasetId: 16, days: 7, posts: { value: 79986, deltaLabel: '+4,667' }, views: { value: 8e9, deltaLabel: '+5.8%' }, followers: { value: 118275630, deltaLabel: '+0.1%' }, accounts: { value: 163, deltaLabel: '+1' }, activeAccounts: { value: 112, deltaLabel: '-8' }, creators: { value: 121, deltaLabel: '+1' }, platforms: [] } },
  activity: { status: 'ready', data: { posts: [], accounts: [], mix: [] } },
  followers: { status: 'ready', data: [] },
  topPosts: { status: 'ready', data: [] },
  attention: { status: 'ready', data: [] },
}

test('with the connector missing, the saved snapshot still shows and nothing waits forever', async ($, on) => {
  mock.store(on, { dataset: { id: 16, name: 'Example Campaign', icon: '📈' }, 'snapshot-16': READY_SNAPSHOT })
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 9, 15) }))
  on('tool.list', () => ({ value: [] }))
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  await startSession($, on)
  await $.command.run(typed('pd'))

  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  expect(await ui.find({ text: /Can't find the PD Intelligence connector/ })).toBeDefined()
  expect(await ui.find({ text: '79,986' })).toBeDefined()
  expect(await ui.find({ text: 'Loading…' })).toBeUndefined()
})

test('with the connector missing and nothing saved, the panel does not pretend to load', async ($, on) => {
  mock.store(on, { dataset: { id: 16, name: 'Example Campaign', icon: '📈' } })
  on('clock.now', () => ({ value: Date.UTC(2026, 9, 9, 15) }))
  on('tool.list', () => ({ value: [] }))
  on('clock.sleep', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  await startSession($, on)
  await $.command.run(typed('pd'))

  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  expect(await ui.find({ text: /Can't find the PD Intelligence connector/ })).toBeDefined()
  expect(await ui.find({ text: 'Loading…' })).toBeUndefined()
})

test('a retry after a failure fetches only the section that failed', async ($, on) => {
  let failing = true
  let sqlCalls = 0
  connector(on, {}, SERVER, (tool, args) => {
    if (tool === 'run_analytics_sql') sqlCalls++
    return failing && String(args.sql ?? '').includes('account_metrics') ? { error: 'sandbox timeout' } : answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  expect(sqlCalls).toBe(3)
  failing = false
  await $.command.run(typed('pd'))
  expect(sqlCalls).toBe(4)
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  expect(await ui.find({ key: 'why-p1' })).toBeDefined()
})

test('a slow earlier load never overwrites a newer Refresh', async ($, on) => {
  let followerCalls = 0
  const clock = connector(on, {}, SERVER, async (tool, args) => {
    if (!String(args.sql ?? '').includes('account_metrics')) return answer(tool, args)
    if (++followerCalls === 1) {
      await clock.sleep(1000)
      return { error: 'sandbox timeout' }
    }
    return answer(tool, args)
  })
  const first = $.command.run(typed('pd-dataset', '16'))
  await clock.settle()
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'refresh' })
  await clock.advance(1000)
  await first

  expect(await ui.find({ text: /Couldn't load this/ })).toBeUndefined()
  expect(await svgChart(ui, /^Followers gained/)).toBeDefined()
})

test('choosing a dataset in a new session does not fetch the previous one', async ($, on) => {
  const asked = new Set<unknown>()
  connector(on, { dataset: { id: 3, name: 'Another Dataset', icon: '🌱' } }, SERVER, (tool, args) => {
    if (tool !== 'list_datasets') asked.add(args.dataset_id)
    return answer(tool, args)
  })
  await startSession($, on)
  await $.command.run(typed('pd-dataset', '16'))
  expect([...asked]).toEqual([16])
})

test('when permissions refuse the panel its lookups, it says how to allow them', async ($, on) => {
  mock.store(on)
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 15) })
  on('tool.list', () => ({ value: toolsOf(SERVER, PD_TOOLS) }))
  on('ui.status', () => ({ value: undefined }))
  on('mcp.call', () => ({ deny: 'The server-side auto mode classifier gave no verdict for this action' }))
  await $.command.run(typed('pd'))

  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  const shown = await ui.find({ text: /permissions stopped the panel/ })
  expect(shown?.text).toContain(
    'list_datasets, get_dashboard_stats, run_analytics_sql, get_leaderboard, get_daily_summary, search_posts, get_post_detail, get_comment_summary, search_accounts',
  )
  expect(shown?.text).toContain('switch out of auto mode')
  expect(await ui.find({ text: /classifier/ })).toBeUndefined()
})

test('platforms read like the dashboard: a colored dot, count, share and change for each', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  const dots = (await ui.findAll({ type: 'Text' })).filter(el => el.text === '●')
  // X and YouTube from the stats, then the top post's platform (X) and the flagged account's (Instagram).
  expect(dots.map(el => el.props.color)).toEqual(['#64748B', '#FF0000', '#64748B', '#E1306C'])
  expect(await ui.find({ text: '1.2%' })).toBeDefined()
  expect(await ui.find({ text: '+4,250' })).toBeDefined()
  expect(String((await ui.findAll({ type: 'Svg' })).find(el => /Posts by platform/.test(String(el.props.alt)))?.props.source)).toContain('#FF0000')
})

test('the status line follows the dataset however it is picked', async ($, on) => {
  const statuses: (string | undefined)[] = []
  connector(on, {}, SERVER, answer, statuses)
  await $.command.run(typed('pd'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.select({ key: 'dataset', value: '3' })
  expect(statuses.at(-1)).toBe('PD Intelligence · 🌱 Another Dataset')

  await $.tool.call({ tool: 'mcp__pd-intel-code__choose_dataset', dataset_id: 16 })
  expect(statuses.at(-1)).toBe('PD Intelligence · 📈 Example Campaign')

  await $.command.run(typed('pd-dataset', '3'))
  expect(statuses.at(-1)).toBe('PD Intelligence · 🌱 Another Dataset')
})

test('Today opens inside the panel: the daily summary and that day’s top posts, no chat', async ($, on) => {
  connector(on)
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run(typed('pd-dataset', '16'))
  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface, ...PANEL })
    await ui.press({ key: 'today' })
    expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toContain('## Biggest stories')
    expect(await ui.find({ text: 'TODAY · summary for Oct 8' })).toBeDefined()
    expect(await ui.find({ text: '1. @carol' })).toBeDefined()
    expect(await ui.find({ key: 'chart-posts' })).toBeUndefined()
    await ui.press({ key: 'back' })
    expect(await ui.find({ key: 'today' })).toBeDefined()
    await ui.unmount()
  }
  expect(sent).toEqual([])
})

test('a failing daily summary fails only Today, and Today is fetched once a day', async ($, on) => {
  let summaries = 0
  connector(on, {}, SERVER, (tool, args) => {
    if (tool !== 'get_daily_summary') return answer(tool, args)
    summaries++
    return summaries === 1 ? { error: 'summary not ready' } : SUMMARY
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'today' })
  expect(await ui.find({ text: "Couldn't load this: PD Intelligence said: summary not ready" })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ text: '79,986' })).toBeDefined()
  await ui.press({ key: 'today' })
  expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toContain('Biggest stories')
  await ui.press({ key: 'back' })
  await ui.press({ key: 'today' })
  expect(summaries).toBe(2)
})

test("a slow Today for one dataset never shows under another", async ($, on) => {
  const clock = connector(on, {}, SERVER, async (tool, args) => {
    if (tool === 'get_daily_summary' && args.dataset_id === 16) {
      await clock.sleep(1000)
      return JSON.stringify({ narrative_text: 'Sixteen', summary_date: '2026-10-08' })
    }
    return tool === 'get_daily_summary' ? JSON.stringify({ narrative_text: 'Three', summary_date: '2026-10-08' }) : answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  // A press settles only once the work it started has: start it, let it reach the slow call.
  const opening = ui.press({ key: 'today' })
  await clock.settle()
  await $.command.run(typed('pd-dataset', '3'))
  await ui.press({ key: 'today' })
  await clock.advance(1000)
  await opening
  expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toBe('Three')
})

test('switching dataset returns the panel home', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'today' })
  await $.command.run(typed('pd-dataset', '3'))
  expect(await ui.find({ key: 'back' })).toBeUndefined()
  expect(await ui.find({ key: 'today' })).toBeDefined()
})

test('Details opens a post in the panel; its comment summary loads on request, slowly', async ($, on) => {
  let commentCalls = 0
  const clock = connector(on, {}, SERVER, async (tool, args) => {
    if (tool === 'get_comment_summary' && ++commentCalls === 1) await clock.sleep(5000)
    return answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'details-p1' })
  expect(await ui.find({ text: '5,000 likes · 1,863 comments · 12 shares' })).toBeDefined()
  expect(await ui.find({ text: 'https://x.com/alice/p1' })).toBeDefined()
  // A press settles only once its work has; the first summary is slow, so start it and look.
  const loading = ui.press({ key: 'load-comments' })
  await clock.settle()
  expect(await ui.find({ text: 'Loading — comment summaries can take a minute or two' })).toBeDefined()
  // The panel stays usable while it loads: Back works, and the post reopens where it was.
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'today' })).toBeDefined()
  await clock.advance(5000)
  await loading
  await ui.press({ key: 'details-p1' })
  await ui.press({ key: 'load-comments' })
  expect(await ui.find({ text: '42 comments collected (the post shows 1,863) · 40 people' })).toBeDefined()
})

test('Details opens an account in the panel, with zeros a platform never publishes said plainly', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'terminal', ...PANEL })
  await ui.press({ key: 'account-quietacct' })
  expect(await ui.find({ text: '3 followers · 53 posts · active 53 days' })).toBeDefined()
  expect(await ui.find({ text: 'Instagram · views not published' })).toBeDefined()
  expect(await ui.find({ key: 'details-p777' })).toBeDefined()
})

test('a post without an internal id offers no Details', async ($, on) => {
  connector(on, {}, SERVER, (tool, args) =>
    tool === 'run_analytics_sql' && String(args.sql).includes('post_metrics_latest')
      ? JSON.stringify({ columns: ['post_id', 'platform', 'author_username', 'text', 'views'], rows: [['old1', 'x_twitter', 'dan', 'Old', 10]] })
      : answer(tool, args),
  )
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  expect(await ui.find({ key: 'why-old1' })).toBeDefined()
  expect(await ui.find({ key: 'details-old1' })).toBeUndefined()
})

test('an account that cannot be found says so, and Back still works', async ($, on) => {
  connector(on, {}, SERVER, (tool, args) => (tool === 'search_accounts' ? JSON.stringify({ items: [] }) : answer(tool, args)))
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'account-quietacct' })
  expect(await ui.find({ text: "Couldn't load this: No account @quietacct on Instagram in this dataset" })).toBeDefined()
  await ui.press({ key: 'back' })
  expect(await ui.find({ key: 'today' })).toBeDefined()
})

// The engine's own answers to turn events, beneath the plugin.
function turns(on: On) {
  on('prompt.submit', ($, e) => ({ text: e.text }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
}
const WHY = 'Why did this post do so well? Deep-dive post p1 (@alice on X) in Example Campaign (#16).'

test('a request sent from the panel shows working, then answered, and the answer reads in the panel', async ($, on) => {
  connector(on)
  turns(on)
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'why-p1' })
  expect(await ui.find({ text: 'Sent' })).toBeDefined()
  await $.turn.start({ text: WHY, turnId: 't1' } as never)
  expect(await ui.find({ text: 'Claude is on it…' })).toBeDefined()
  await $.turn.complete({ answer: '## Why it worked\n\nThe **hook** landed.', turnId: 't1', durationMs: 5, isAborted: false, reason: 'answer' } as never)
  expect(await ui.find({ text: 'Answered' })).toBeDefined()
  expect(await ui.find({ text: 'Why it worked The hook landed.' })).toBeDefined()
  const show = (await ui.findAll({ type: 'Button' })).find(el => el.props.label === 'Show answer')
  await ui.press({ key: String(show?.key) })
  expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toContain('The **hook** landed.')
  expect(await ui.find({ text: WHY })).toBeDefined()
})

test("turns the panel did not start, and subagents' turns, leave requests alone", async ($, on) => {
  connector(on)
  turns(on)
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'why-p1' })
  await $.turn.start({ text: 'something the person typed', turnId: 't9' } as never)
  await $.turn.complete({ answer: 'x', turnId: 't9', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  expect(await ui.find({ text: 'Sent' })).toBeDefined()
  await $.turn.start({ text: WHY, turnId: 't1' } as never)
  await $.turn.complete({ answer: 'sub', turnId: 't1', agentId: 'a1', durationMs: 1, isAborted: false, reason: 'answer' } as never)
  expect(await ui.find({ text: 'Claude is on it…' })).toBeDefined()
  await $.turn.complete({ answer: '', turnId: 't1', durationMs: 1, isAborted: true, reason: 'aborted' } as never)
  expect(await ui.find({ text: 'Stopped' })).toBeDefined()
})

test('datasets you used lately come first in the list', async ($, on) => {
  connector(on)
  await $.command.run(typed('pd'))
  // Pinned 3, then 16: most recent first, unlike the list's id order (3, 16).
  await $.command.run(typed('pd-dataset', '3'))
  await $.command.run(typed('pd-dataset', '16'))
  const desk = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  const options = (await desk.find({ key: 'dataset' }))?.props.options as { value: string }[]
  expect(options.map(o => o.value)).toEqual(['16', '3'])
  const phone = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'mobile', ...PANEL })
  expect(await phone.find({ text: 'Recent' })).toBeDefined()
})

test('ready-made questions go to Claude with the dataset filled in, and show in Requests', async ($, on) => {
  connector(on)
  const sent: string[] = []
  on('prompt.submit', ($, e) => {
    sent.push(e.text)
    return { text: e.text }
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'question-0' })
  expect(sent).toEqual(['Show posts per day by platform for the last 30 days in Example Campaign (#16).'])
  expect(await ui.find({ text: 'Posts per day by platform' })).toBeDefined()
  expect(await ui.find({ text: 'Sent' })).toBeDefined()
})

test('an account is found on its own platform even when similar handles fill the first page', async ($, on) => {
  const others = JSON.stringify({ items: Array.from({ length: 25 }, (_, i) => ({ author_username: `quietacct${i}`, platform: 'x_twitter' })) })
  connector(on, {}, SERVER, (tool, args) => {
    if (tool === 'search_accounts') return args.platform === 'instagram' ? ACCOUNTS : others
    if (tool === 'search_posts' && args.search) return args.platform === 'instagram' ? ACCOUNT_POSTS : JSON.stringify({ items: [] })
    return answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'account-quietacct' })
  expect(await ui.find({ text: '3 followers · 53 posts · active 53 days' })).toBeDefined()
  expect(await ui.find({ key: 'details-p777' })).toBeDefined()
})

test('Refresh reloads the screen that is open', async ($, on) => {
  let summaries = 0
  connector(on, {}, SERVER, (tool, args) => {
    if (tool !== 'get_daily_summary') return answer(tool, args)
    return ++summaries === 1 ? { error: 'connector still connecting' } : SUMMARY
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'today' })
  expect(await ui.find({ text: /Couldn't load this/ })).toBeDefined()
  await ui.press({ key: 'refresh' })
  expect(String((await ui.find({ type: 'Markdown' }))?.props.text)).toContain('Biggest stories')
})

test("an account opened in another dataset never shows the first dataset's numbers", async ($, on) => {
  const clock = connector(on, {}, SERVER, async (tool, args) => {
    if (tool === 'search_accounts' && args.dataset_id === 16) {
      await clock.sleep(1000)
      return JSON.stringify({ items: [{ ...JSON.parse(ACCOUNTS).items[0], followers_count: 999 }] })
    }
    return answer(tool, args)
  })
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  const opening = ui.press({ key: 'account-quietacct' })
  await clock.settle()
  await $.command.run(typed('pd-dataset', '3'))
  await ui.press({ key: 'account-quietacct' })
  await clock.advance(1000)
  await opening
  expect(await ui.find({ text: '3 followers · 53 posts · active 53 days' })).toBeDefined()
  expect(await ui.find({ text: /999 followers/ })).toBeUndefined()
})

test('an Instagram account with no published views says so', async ($, on) => {
  connector(on, {}, SERVER, (tool, args) =>
    tool === 'search_accounts'
      ? JSON.stringify({ items: [{ ...JSON.parse(ACCOUNTS).items[0], total_views: 0 }] })
      : answer(tool, args),
  )
  await $.command.run(typed('pd-dataset', '16'))
  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...PANEL })
  await ui.press({ key: 'account-quietacct' })
  expect(await ui.find({ text: 'views not published · 10 likes · 2 comments' })).toBeDefined()
})

// The desktop's first click on the side panel, while the chat box has the keys, only moves the focus.
test('a click that only focuses the side panel still presses its button, once', async ($, on) => {
  let listed = 0
  connector(on, {}, SERVER, (tool, args) => {
    if (tool === 'list_datasets') listed++
    return answer(tool, args)
  })
  on('ui.focus', () => ({}))
  const click = (element: string) => $.ui.focus({ component: 'Pane', requestId: 'pd', element, origin: { kind: 'person' } })
  await $.command.run(typed('pd-dataset', '16'))
  const side = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...SIDE })

  await click('today')
  expect(await side.find({ key: 'back' })).toBeDefined()
  await side.press({ key: 'back' })

  // Should the click's own press come after all, it is not run a second time. The panel's own
  // press is not awaited by the focus move: a few round trips let it run.
  const settle = async () => {
    for (let i = 0; i < 30; i++) await side.find({ key: 'refresh' })
  }
  const before = listed
  await click('refresh')
  await side.press({ key: 'refresh' })
  await settle()
  expect(listed).toBe(before + 1)

  // Once the panel holds the keys, moving the focus (Tab) presses nothing.
  await side.redraw({ ...SIDE.props, isFocused: true })
  await click('today')
  expect(await side.find({ key: 'back' })).toBeUndefined()
})

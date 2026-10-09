import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const SERVER = 'PD_Intelligence'
const LIST = `mcp__${SERVER}__list_datasets`
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
const COMPOSE = { model: 'm', promptModel: 'm', surfaces: [], tools: [], outputStyle: null, traits: [] } as const
const SIDE = { component: 'Pane', requestId: 'pd', props: { title: 'PD Intelligence', isFocused: false, bodyColumns: 50, placement: 'dock', scroll: { offset: 0, bodyRows: 40 }, view: {} } } as const
const PANEL = { component: 'CommandOutput', props: { command: 'pd', args: '', text: '', isErrored: false } } as const

// A slash command as the person types it.
const typed = (command: string, args = '') =>
  ({ command, args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 120 } }) as const

// The connector, as the engine's tool list and MCP client would answer.
function connector(on: On, saved: Record<string, unknown> = {}) {
  mock.store(on, saved)
  mock.clock(on, { now: Date.UTC(2026, 9, 9, 15) })
  on('tool.list', () => ({ value: [{ name: LIST, description: '', mcp: true }] }))
  on('mcp.call', ($, e) => ({
    value: { content: [{ type: 'text', text: e.tool === 'list_datasets' ? DATASETS : STATS }], isError: false },
  }))
  on('ui.status', () => ({ value: undefined }))
}

test('the panel lists datasets; pressing one pins it, shows its numbers and reaches the prompt', async ($, on) => {
  connector(on)
  on('prompt.compose', () => ({ sections: [] }))
  await $.command.run(typed('pd'))

  const first = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'terminal', ...PANEL })
  expect(await first.find({ text: /No dataset chosen yet/ })).toBeDefined()
  expect(await first.find({ key: 'explore' })).toBeUndefined()
  await first.press({ key: 'ds-16' })
  await first.unmount()

  for (const surface of ['terminal', 'desktop', 'mobile'] as const) {
    const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface, ...PANEL })
    expect(await ui.find({ text: '📈 Example Campaign' })).toBeDefined()
    expect(await ui.find({ text: '79,986' })).toBeDefined()
    expect(await ui.find({ text: '8B' })).toBeDefined()
    expect(await ui.find({ text: 'X 75.2K · YouTube 921' })).toBeDefined()
    expect(await ui.find({ key: 'explore' })).toBeDefined()
    expect(await ui.find({ key: 'ds-3' })).toBeDefined()
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
  expect(await chat.find({ key: 'ds-3' })).toBeUndefined()

  const side = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'desktop', ...SIDE })
  expect(await side.find({ key: 'ds-3' })).toBeDefined()

  const phone = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'mobile', ...PANEL })
  expect(await phone.find({ key: 'ds-3' })).toBeDefined()
  expect(await phone.find({ key: 'to-side' })).toBeUndefined()

  await $.command.run(typed('pd'))
  expect(panes).toEqual(['open pd', 'open pd'])

  await chat.press({ key: 'to-chat' })
  expect(panes.at(-1)).toBe('close pd')
  expect(await chat.find({ key: 'ds-3' })).toBeDefined()
})

test('the panel says plainly when the connector is missing', async ($, on) => {
  mock.store(on)
  on('tool.list', () => ({ value: [] }))
  await $.command.run(typed('pd'))

  const ui = await $.ui.mount({ plugin: 'pd-intel-code', surface: 'terminal', ...PANEL })
  expect(await ui.find({ text: /PD Intelligence is not connected/ })).toBeDefined()
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
  on('tool.check', () => ({ decision: 'allow' }))

  expect((await $.tool.check({ tool: DELETE, input: { dataset_id: 16, tag_id: 1 } })).decision).toBe('ask')
  expect((await $.tool.check({ tool: SEARCH, input: { dataset_id: 16 } })).decision).toBe('allow')
})

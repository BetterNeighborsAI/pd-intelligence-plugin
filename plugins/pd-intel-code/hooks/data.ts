// Pure helpers: names, formatting and the shapes PD Intelligence answers in.
// Nothing here takes `$`: the engine follows `$` only within register.tsx.

import type {
  PdAccountRef,
  PdAccountStats,
  PdActivity,
  PdCommentSummary,
  PdDataset,
  PdDay,
  PdGlance,
  PdMetric,
  PdPostDetail,
  PdRequest,
  PdSnapshot,
  PdSummary,
  PdTopPost,
  PdWeakAccount,
} from '../types'

// The PD Intelligence server is recognised by its tools, never by its name: the
// connector is named differently per install (PD_Intelligence, claude_ai_PD_Intelligence,
// whatever someone typed in `claude mcp add`). A server with both of these is PD.
export const PD_SIGNATURE = ['list_datasets', 'get_dashboard_stats'] as const
// Any MCP tool but this mod's own; the hook checks the server is PD's.
export const MCP_TOOL = /^mcp__(?!pd-intel-code__)/

// The window the panel's "change" column covers.
export const GLANCE_DAYS = 7

export const PLATFORM_NAMES: Record<string, string> = {
  facebook: 'Facebook',
  instagram: 'Instagram',
  threads: 'Threads',
  bluesky: 'Bluesky',
  tiktok: 'TikTok',
  x_twitter: 'X',
  youtube: 'YouTube',
}

export const platformName = (p: string) => PLATFORM_NAMES[p] ?? p
// PD's own key for a platform's display name (`X` is `x_twitter`), for filters.
export const platformKey = (name: string) =>
  Object.entries(PLATFORM_NAMES).find(([, v]) => v === name)?.[0] ?? name.toLowerCase()

export const shortName = (tool: string) => tool.slice(tool.lastIndexOf('__') + 2)
export const serverName = (tool: string) => tool.slice('mcp__'.length, tool.lastIndexOf('__'))

export const grouped = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

export function compact(n: number): string {
  // Exact below 10,000; rounded to one decimal of K, M or B above it.
  for (const [from, size, unit] of [[1e9, 1e9, 'B'], [1e6, 1e6, 'M'], [1e4, 1e3, 'K']] as const) {
    if (Math.abs(n) >= from) return `${(n / size).toFixed(1).replace(/\.0$/, '')}${unit}`
  }
  return grouped(n)
}

// `1 post`, `2,767 views`.
export const plural = (n: number, word: string) => `${grouped(n)} ${word}${n === 1 ? '' : 's'}`

export const label = (d: PdDataset) => `${d.icon ? `${d.icon.trim()} ` : ''}${d.name}`

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
}

// list_datasets answers `{ result: [{ id, name, icon, ... }] }`.
export function toDatasets(parsed: unknown): PdDataset[] | undefined {
  const rows = (parsed as { result?: unknown } | undefined)?.result
  if (!Array.isArray(rows)) return undefined
  return rows
    .filter(r => typeof r?.id === 'number' && typeof r?.name === 'string')
    .map(r => ({ id: r.id as number, name: r.name as string, icon: typeof r.icon === 'string' ? r.icon : '' }))
    .sort((a, b) => a.id - b.id)
}

export function toGlance(datasetId: number, raw: Record<string, unknown>): PdGlance {
  const metric = (v: unknown): PdMetric => {
    const m = v as { value?: unknown; delta_label?: unknown } | undefined
    return { value: Number(m?.value ?? 0), deltaLabel: String(m?.delta_label ?? '') }
  }
  const platforms = Object.entries((raw.platforms ?? {}) as Record<string, unknown>)
    .map(([platform, v]) => ({ platform: platformName(platform), posts: metric(v) }))
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

export const DAY_MS = 86_400_000
// How many days the tiles' charts cover.
export const SERIES_DAYS = 14

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10)

// The `n` days ending with `today`, oldest first, as YYYY-MM-DD (UTC).
export function lastDays(today: string, n = SERIES_DAYS): string[] {
  const end = Date.parse(`${today}T00:00:00Z`)
  return Array.from({ length: n }, (_, i) => dayKey(end - (n - 1 - i) * DAY_MS))
}

export function shortDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`
}

// run_analytics_sql answers `{ columns: [...], rows: [[...], ...] }`.
export function rowsOf(parsed: unknown): Record<string, unknown>[] {
  const { columns, rows } = (parsed ?? {}) as { columns?: unknown; rows?: unknown }
  if (!Array.isArray(columns) || !Array.isArray(rows)) {
    throw new Error('PD Intelligence answered in a shape the panel does not know')
  }
  return rows.map(r => Object.fromEntries(columns.map((c, i) => [String(c), (r as unknown[])[i]])))
}

// The dates in these queries come from lastDays, never from input.
export const activitySql = (from: string) =>
  `SELECT CAST(post_timestamp AS DATE) AS day, platform, COUNT(*) AS posts, COUNT(DISTINCT account_id) AS accounts ` +
  `FROM posts WHERE post_timestamp >= DATE '${from}' GROUP BY 1, 2`

// Each account's last follower count per day, carried over days without one, summed over the
// accounts that had a count by the first day, so one counted mid-window is not a jump.
export const followersSql = (from: string, to: string) =>
  `WITH days AS (SELECT CAST(d AS DATE) AS day FROM range(DATE '${from}', DATE '${to}' + INTERVAL 1 DAY, INTERVAL 1 DAY) t(d)), ` +
  `snaps AS (SELECT account_id, CAST(created_at AS DATE) AS day, arg_max(followers_count, created_at) AS followers FROM account_metrics GROUP BY 1, 2), ` +
  `grid AS (SELECT a.account_id, d.day FROM (SELECT DISTINCT account_id FROM snaps WHERE day <= DATE '${from}') a CROSS JOIN days d), ` +
  `filled AS (SELECT g.day, (SELECT s.followers FROM snaps s WHERE s.account_id = g.account_id AND s.day <= g.day ORDER BY s.day DESC LIMIT 1) AS followers FROM grid g) ` +
  `SELECT day, SUM(followers) AS followers FROM filled GROUP BY day ORDER BY day`

export const topPostsSql = (from: string) =>
  `SELECT p.id AS id, p.post_id, p.platform, p.author_username, left(regexp_replace(coalesce(p.title, p.post_text, ''), '\\s+', ' ', 'g'), 120) AS text, m.views, p.content_type ` +
  `FROM posts p JOIN post_metrics_latest m ON m.post_id = p.id ` +
  `WHERE p.post_timestamp >= DATE '${from}' ORDER BY m.views DESC NULLS LAST LIMIT 3`

const sqlDay = (v: unknown) => String(v).slice(0, 10)

export function toActivity(rows: readonly Record<string, unknown>[], days: readonly string[]): PdActivity {
  const posts = new Map<string, number>()
  const accounts = new Map<string, number>()
  for (const r of rows) {
    const day = sqlDay(r.day)
    const n = Number(r.posts ?? 0)
    posts.set(day, (posts.get(day) ?? 0) + n)
    accounts.set(day, (accounts.get(day) ?? 0) + Number(r.accounts ?? 0))
  }
  return {
    posts: days.map(day => ({ day, value: posts.get(day) ?? 0 })),
    accounts: days.map(day => ({ day, value: accounts.get(day) ?? 0 })),
  }
}

export function toFollowers(rows: readonly Record<string, unknown>[], days: readonly string[]): PdDay[] {
  // A day no account has a count for yet comes back null: no value, not zero.
  const byDay = new Map(rows.map(r => [sqlDay(r.day), r.followers == null ? NaN : Number(r.followers)]))
  let last: number | undefined
  const filled = days.map(day => {
    const v = byDay.get(day)
    if (v !== undefined && Number.isFinite(v)) last = v
    return last
  })
  const base = filled.find(v => v !== undefined)
  if (base === undefined) return []
  return days.flatMap((day, i) => (filled[i] === undefined ? [] : [{ day, value: filled[i]! - base }]))
}

export function toTopPosts(rows: readonly Record<string, unknown>[]): PdTopPost[] {
  return rows.map(r => ({
    postId: String(r.post_id),
    platform: platformName(String(r.platform ?? '')),
    author: String(r.author_username ?? ''),
    text: String(r.text ?? '').trim(),
    views: Number(r.views ?? 0),
    id: r.id == null ? undefined : Number(r.id),
    contentType: r.content_type == null ? undefined : String(r.content_type),
  }))
}

// get_leaderboard answers `{ result: [...] }`. Its engagement figures are left
// out on purpose: hidden likes come back as -1 per post.
export function toAttention(parsed: unknown): PdWeakAccount[] {
  const rows = (parsed as { result?: unknown } | undefined)?.result
  if (!Array.isArray(rows)) throw new Error('PD Intelligence answered in a shape the panel does not know')
  return rows
    .map(r => ({
      username: String(r?.author_username ?? r?.username ?? ''),
      platform: platformName(String(r?.platform ?? '')),
      posts: Number(r?.total_posts ?? 0),
      views: Number(r?.total_views ?? 0),
    }))
    .filter(a => a.username !== '')
}

export const SECTION_KEYS = ['glance', 'activity', 'followers', 'topPosts', 'attention'] as const
export type SectionKey = (typeof SECTION_KEYS)[number]

export const isStale = (s: PdSnapshot, today: string) =>
  s.fetchedOn < today || SECTION_KEYS.some(k => s[k].status !== 'ready')

// The read-only tools the panel itself calls; an allow rule for these lets it work in auto mode.
export const PANEL_TOOLS = [
  'list_datasets',
  'get_dashboard_stats',
  'run_analytics_sql',
  'get_leaderboard',
  'get_daily_summary',
  'search_posts',
  'get_post_detail',
  'get_comment_summary',
  'search_accounts',
] as const

// What the panel says when Claude Code's permissions refuse one of its own lookups (in auto
// mode a call the panel makes by itself has no request behind it to judge, so it is refused).
export const blockedMessage = (tool: string) =>
  `Claude Code's permissions stopped the panel from asking PD Intelligence for data (${tool}). ` +
  `In auto mode a lookup the panel makes by itself can't be judged, so it is refused. ` +
  `To fix it, allow PD Intelligence's read-only tools (${PANEL_TOOLS.join(', ')}) in your permission settings, ` +
  `or switch out of auto mode, then press Refresh.`

const num = (v: unknown) => Number(v ?? 0) || 0
const str = (v: unknown) => (v == null ? '' : String(v))
const unknownShape = () => new Error('PD Intelligence answered in a shape the panel does not know')

export function toSummary(parsed: unknown): PdSummary {
  const r = (parsed ?? {}) as Record<string, unknown>
  if (typeof r.narrative_text !== 'string' || r.narrative_text.trim() === '') {
    throw new Error('PD Intelligence has no daily summary for this dataset yet')
  }
  return { date: str(r.summary_date), narrative: r.narrative_text }
}

// search_posts answers `{ items: [...] }`.
export function toPosts(parsed: unknown): PdTopPost[] {
  const items = (parsed as { items?: unknown } | undefined)?.items
  if (!Array.isArray(items)) throw unknownShape()
  return items.map(r => ({
    id: r?.id == null ? undefined : Number(r.id),
    postId: str(r?.post_id),
    platform: platformName(str(r?.platform)),
    author: str(r?.author_username),
    text: str(r?.post_text).trim(),
    views: num(r?.views),
    contentType: r?.content_type == null ? undefined : String(r.content_type),
  }))
}

export function toPostDetail(parsed: unknown): PdPostDetail {
  const r = (parsed ?? {}) as Record<string, unknown>
  if (r.post_url === undefined && r.views === undefined) throw unknownShape()
  return {
    views: num(r.views),
    likes: num(r.likes),
    comments: num(r.comments),
    shares: num(r.shares),
    engagementRate: num(r.engagement_rate),
    postedAt: str(r.post_timestamp),
    url: str(r.post_url),
    contentType: str(r.content_type),
  }
}

export function toCommentSummary(parsed: unknown): PdCommentSummary {
  const r = (parsed ?? {}) as { summary_stats?: Record<string, unknown>; timeline?: unknown }
  if (!r.summary_stats) throw unknownShape()
  const timeline = Array.isArray(r.timeline) ? r.timeline : []
  return {
    collected: num(r.summary_stats.total_comments),
    commenters: num(r.summary_stats.total_commenters),
    authorReplies: num(r.summary_stats.author_reply_count),
    byDay: timeline.map(t => ({ day: str(t?.date).slice(0, 10), value: num(t?.count) })),
  }
}

// search_accounts matches handles loosely: keep the one on the row's platform.
export function toAccountStats(parsed: unknown, ref: PdAccountRef): PdAccountStats {
  const items = (parsed as { items?: unknown } | undefined)?.items
  if (!Array.isArray(items)) throw unknownShape()
  const r = items.find(
    a => str(a?.author_username).toLowerCase() === ref.username.toLowerCase() && platformName(str(a?.platform)) === ref.platform,
  )
  if (!r) throw new Error(`No account @${ref.username} on ${ref.platform} in this dataset`)
  return {
    followers: num(r.followers_count),
    posts: num(r.total_posts),
    views: num(r.total_views),
    likes: num(r.total_likes),
    comments: num(r.total_comments),
    engagementRate: num(r.engagement_rate),
    firstPost: str(r.first_post),
    lastPost: str(r.last_post),
    activeDays: num(r.active_days),
  }
}

// Threads and Bluesky never publish views; Instagram only on video (Reels).
export function viewsLabel(platform: string, views: number, contentType?: string): string {
  const unpublished = platform === 'Threads' || platform === 'Bluesky' || (platform === 'Instagram' && contentType !== 'video')
  if (views === 0 && unpublished) return 'views not published'
  return `${compact(views)} ${views === 1 ? 'view' : 'views'}`
}

export const pushRecent = (ids: readonly number[], id: number, max = 5) => [id, ...ids.filter(x => x !== id)].slice(0, max)

export function orderByRecent(list: readonly PdDataset[], recent: readonly number[]): PdDataset[] {
  const first = recent.flatMap(id => list.filter(d => d.id === id))
  return [...first, ...list.filter(d => !recent.includes(d.id))]
}

// Tested questions the panel hands to Claude; the dataset is filled in at press time.
export const QUESTIONS: readonly { label: string; ask: (d: PdDataset) => string }[] = [
  { label: 'Posts per day by platform', ask: d => `Show posts per day by platform for the last 30 days in ${d.name} (#${d.id}).` },
  { label: 'Biggest follower gains', ask: d => `Which accounts gained the most followers this month in ${d.name} (#${d.id})?` },
  { label: 'Most-discussed posts', ask: d => `Which posts drew the most comments this week in ${d.name} (#${d.id}), and what are people saying?` },
  { label: 'Engagement by platform', ask: d => `Compare engagement by platform this month in ${d.name} (#${d.id}), using each platform's published metrics.` },
]

export const startRequest = (list: readonly PdRequest[], req: PdRequest, max = 10) => [req, ...list].slice(0, max)

// The oldest request still waiting with this exact text starts this turn (the list is
// newest first); any other turn is not the panel's.
export function requestStarted(list: readonly PdRequest[], text: string, turnId: string): PdRequest[] {
  const i = list.map(r => r.status === 'sent' && r.text === text).lastIndexOf(true)
  return i < 0 ? [...list] : list.map((r, j) => (j === i ? { ...r, status: 'working', turnId } : r))
}

export const requestDone = (list: readonly PdRequest[], turnId: string, answer: string, stopped: boolean): PdRequest[] =>
  list.map(r => (r.turnId === turnId && r.status === 'working' ? { ...r, status: stopped ? 'stopped' : 'answered', answer } : r))

// Markdown to one plain line: headings, emphasis and link targets dropped.
export function plainPreview(markdown: string, max: number): string {
  const flat = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#*_`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
  const chars = [...flat]
  return chars.length <= max ? flat : `${chars.slice(0, max - 1).join('')}…`
}

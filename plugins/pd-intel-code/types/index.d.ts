/** One PD Intelligence tool call, as /pd-evidence lists it. */
export type PdEvidence = {
  /** 1-based position in this session's ledger. */
  n: number
  /** The tool's own name, without its `mcp__<server>__` prefix. */
  tool: string
  /** The arguments the call was made with. */
  args: Record<string, unknown>
  /** When it returned, ISO 8601 UTC. */
  at: string
  isError: boolean
  /** Length of the result text the model read. */
  chars: number
  /** Where the raw result was saved, when evidence capture was on. */
  file?: string
}

/** A dataset as list_datasets returns it, trimmed to what the panel shows. */
export type PdDataset = { id: number; name: string; icon: string }

/** One headline number and its change over the comparison window. */
export type PdMetric = { value: number; deltaLabel: string }

/** get_dashboard_stats for the pinned dataset, as the panel draws it. */
export type PdGlance = {
  datasetId: number
  days: number
  posts: PdMetric
  views: PdMetric
  followers: PdMetric
  accounts: PdMetric
  activeAccounts: PdMetric
  creators: PdMetric
  platforms: { platform: string; posts: PdMetric }[]
}

/** One day's value in a series; `day` is YYYY-MM-DD (UTC). */
export type PdDay = { day: string; value: number }

/** A panel section: each loads, and fails, on its own. */
export type PdSection<T> =
  | { status: 'loading' }
  | { status: 'ready'; data: T }
  | { status: 'failed'; message: string }

/** Posts and posting accounts per day. */
export type PdActivity = {
  posts: PdDay[]
  accounts: PdDay[]
}

/** A post the panel lists; `id` (PD's internal id) is what drill-ins need. */
export type PdTopPost = { id?: number; postId: string; platform: string; author: string; text: string; views: number; contentType?: string }

/** An account get_leaderboard's needs_attention mode ranks low. */
export type PdWeakAccount = { username: string; platform: string; posts: number; views: number }

/** Everything the panel shows for one dataset. */
export type PdSnapshot = {
  datasetId: number
  /** The UTC day it was fetched, YYYY-MM-DD. */
  fetchedOn: string
  glance: PdSection<PdGlance>
  activity: PdSection<PdActivity>
  /** Followers gained or lost since the first day of the window. */
  followers: PdSection<PdDay[]>
  topPosts: PdSection<PdTopPost[]>
  attention: PdSection<PdWeakAccount[]>
}

/** PD's daily summary for a dataset: its markdown narrative and the day it covers. */
export type PdSummary = { date: string; narrative: string }

/** The Today screen's data, fetched when opened and kept for the UTC day. */
export type PdToday = { datasetId: number; fetchedOn: string; summary: PdSection<PdSummary>; posts: PdSection<PdTopPost[]> }

export type PdPostDetail = {
  views: number
  likes: number
  comments: number
  shares: number
  engagementRate: number
  postedAt: string
  url: string
  contentType: string
}

/** Comments PD collected for one post (can be fewer than the post's own count). */
export type PdCommentSummary = { collected: number; commenters: number; authorReplies: number; byDay: PdDay[] }

export type PdAccountStats = {
  followers: number
  posts: number
  views: number
  likes: number
  comments: number
  engagementRate: number
  firstPost: string
  lastPost: string
  activeDays: number
}

/** An account as a row names it: handle and platform display name. */
export type PdAccountRef = { username: string; platform: string }

/** What the panel shows. */
export type PdScreen =
  | { kind: 'home' }
  | { kind: 'today' }
  | { kind: 'post'; post: PdTopPost }
  | { kind: 'account'; account: PdAccountRef }
  | { kind: 'answer'; requestId: string }

/** A request the panel handed to Claude, and what came of it. */
export type PdRequest = {
  id: string
  label: string
  text: string
  status: 'sent' | 'working' | 'answered' | 'stopped'
  at: string
  turnId?: string
  answer?: string
}

export type PdPostView = { datasetId: number; postId: number; detail: PdSection<PdPostDetail>; comments: PdSection<PdCommentSummary> | null }
export type PdAccountView = { datasetId: number; key: string; stats: PdSection<PdAccountStats>; recent: PdSection<PdTopPost[]> }

declare module 'claude-code' {
  interface PluginState {
    'pd-intel-code': {
      ledger: PdEvidence[]
      /** Every dataset the person can see; null until first loaded. */
      datasets: PdDataset[] | null
      /** The dataset Claude works in (mirrors $.store `dataset`). */
      pinned: PdDataset | null
      /** The pinned dataset's control-center data (mirrors $.store `snapshot-ID`). */
      snapshot: PdSnapshot | null
      /** What the panel draws: home or one of its in-panel views (session only). */
      screen: PdScreen
      /** The Today screen's data for the pinned dataset (mirrors $.store `today-ID`). */
      today: PdToday | null
      postView: PdPostView | null
      accountView: PdAccountView | null
      /** Requests the panel handed to Claude, newest first (session only). */
      requests: PdRequest[]
      /** Recently pinned dataset ids, most recent first (mirrors $.store `recentDatasets`). */
      recent: number[]
      /** Whether raw results are saved to disk (mirrors $.store `capture`). */
      capture: boolean
      /** A loading or error line the panel shows above everything else. */
      notice: string | null
      /** Where /pd shows the panel: in the chat, or the side panel (mirrors $.store `view`). */
      view: 'chat' | 'side'
      /** For each MCP server a tool call went to: whether it is PD Intelligence. */
      pdServers: Record<string, boolean>
    }
  }
}

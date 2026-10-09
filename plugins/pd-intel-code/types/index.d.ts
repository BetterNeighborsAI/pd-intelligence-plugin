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

declare module 'claude-code' {
  interface PluginState {
    'pd-intel-code': {
      ledger: PdEvidence[]
      /** Every dataset the person can see; null until first loaded. */
      datasets: PdDataset[] | null
      /** The dataset Claude works in (mirrors $.store `dataset`). */
      pinned: PdDataset | null
      glance: PdGlance | null
      /** Whether raw results are saved to disk (mirrors $.store `capture`). */
      capture: boolean
      /** A loading or error line the panel shows above everything else. */
      notice: string | null
      /** Where /pd shows the panel: in the chat, or the side panel (mirrors $.store `view`). */
      view: 'chat' | 'side'
    }
  }
}

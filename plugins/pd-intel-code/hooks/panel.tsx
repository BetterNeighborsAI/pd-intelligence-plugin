// The /pd panel's drawing and its text twin. Pure: register.tsx reads the
// state, resolves the elements and hands over the closures that act, since the
// engine follows `$` only within register.tsx.

import type { Elements, RenderSurface } from 'claude-code'

import type {
  PdAccountView,
  PdDataset,
  PdDay,
  PdMetric,
  PdPostView,
  PdRequest,
  PdScreen,
  PdSection,
  PdSnapshot,
  PdToday,
  PdTopPost,
  PdWeakAccount,
} from '../types'
import { apportion, barSvg, lineSvg, mixSvg, oneLine, platformColor, sparkline, type ChartPoint, type Series } from './charts'
import { QUESTIONS, compact, grouped, label, orderByRecent, plainPreview, plural, shortDay, viewsLabel } from './data'

type Els = Elements[keyof Elements]

/** What the panel shows, read from state by register.tsx. */
export type PanelData = {
  list: readonly PdDataset[] | null
  current: PdDataset | null
  /** The snapshot, only when it is the current dataset's. */
  snap: PdSnapshot | null
  isCapturing: boolean
  /** A loading or error line shown above everything else. */
  line: string | null
  calls: number
  screen: PdScreen
  /** Today's data, only drawn when it is the current dataset's. */
  today: PdToday | null
  postView: PdPostView | null
  accountView: PdAccountView | null
  /** Requests the panel handed to Claude, newest first. */
  requests: PdRequest[]
  /** Recently pinned dataset ids, most recent first. */
  recent: number[]
}

/** What the panel's controls do; register.tsx builds these around `$`. */
export type PanelActions = {
  pin: (d: PdDataset | null) => unknown
  refresh: () => unknown
  setCapture: (on: boolean) => unknown
  /** Sends a request to Claude as the person's own message, tracked under `label`. */
  ask: (text: string, label: string) => unknown
  run: (command: string) => unknown
  /** Opens one of the panel's own screens. */
  show: (s: PdScreen) => unknown
  back: () => unknown
  /** Fetches the open post's comment summary (slow: can take minutes). */
  loadComments: () => unknown
}

const named = (d: PdDataset) => `${d.name} (#${d.id})`
export const whyPrompt = (d: PdDataset, p: PdTopPost) =>
  `Why did this post do so well? Deep-dive post ${p.postId} (@${p.author} on ${p.platform}) in ${named(d)}.`
export const lookPrompt = (d: PdDataset, a: PdWeakAccount) => `Look into why @${a.username} is underperforming in ${named(d)}.`

const REQUEST_STATUS: Record<PdRequest['status'], string> = {
  sent: 'Sent',
  working: 'Claude is on it…',
  answered: 'Answered',
  stopped: 'Stopped',
}

const ready = <T,>(s: PdSection<T> | undefined): T | undefined => (s?.status === 'ready' ? s.data : undefined)
const signed = (n: number) => `${n > 0 ? '+' : ''}${grouped(n)}`

export function drawPanel(els: Els, surface: RenderSurface, data: PanelData, actions: PanelActions, extra?: JSX.Element) {
  const { Box, Text, Button } = els
  // By surface, as the engine's element tables are: no Svg on the terminal, no Select on mobile.
  const Svg = surface === 'terminal' ? undefined : (els as Elements['desktop']).Svg
  const Select = surface === 'mobile' ? undefined : (els as Elements['desktop']).Select
  const { list, current: pinnedDataset, snap, isCapturing, line, calls, screen: sc, today } = data
  // With an error standing and nothing saved to show, the sections would only say "Loading…".
  const current = pinnedDataset && (snap || !line) ? pinnedDataset : null

  // What a section shows while loading or after failing; undefined once ready.
  const pending = (key: string, s: PdSection<unknown> | undefined) =>
    !s || s.status === 'loading' ? (
      <Text key={key} dimColor>Loading…</Text>
    ) : s.status === 'failed' ? (
      <Text key={key} color="warning">{`Couldn't load this: ${s.message}`}</Text>
    ) : undefined

  // Bars for daily counts, a line for a running figure; each metric in its own color.
  const chart = (key: string, points: ChartPoint[], alt: string, series: Series, form: 'bars' | 'line' = 'bars') =>
    Svg ? (
      <Svg key={key} source={form === 'line' ? lineSvg(points, series) : barSvg(points, series)} alt={alt} isInteractive />
    ) : (
      <Text key={key}>{sparkline(points.map(p => p.value))}</Text>
    )

  const g = ready(snap?.glance)
  // Threads' dashboard color is near-black: the theme's text color keeps its dot visible in dark mode.
  const dot = (platform: string) => (platform === 'Threads' ? 'text' : platformColor(platform))
  const platformTotal = g ? g.platforms.reduce((s, x) => s + x.posts.value, 0) || 1 : 1
  const share = (n: number) => `${((n / platformTotal) * 100).toFixed(1)}%`
  // One post: who and where, what it said, then what to do with it on a row of its own.
  const postRow = (p: PdTopPost, i: number) => (
    <Box key={`post-${p.postId}`} flexDirection="column">
      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        <Text bold>{`${i + 1}. @${p.author}`}</Text>
        <Text color={dot(p.platform)}>●</Text>
        <Text dimColor>{`${p.platform} · ${viewsLabel(p.platform, p.views, p.contentType)}`}</Text>
      </Box>
      <Text dimColor italic>{oneLine(p.text, 90)}</Text>
      {(current || (p.id !== undefined && sc.kind !== 'post')) && (
        <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
          {p.id !== undefined && sc.kind !== 'post' && (
            <Button key={`details-${p.postId}`} label="Details" onPress={() => actions.show({ kind: 'post', post: p })} />
          )}
          {current && (
            <Button key={`why-${p.postId}`} label="Ask Claude: why?" onPress={() => actions.ask(whyPrompt(current, p), `Why @${p.author}'s post did well`)} />
          )}
        </Box>
      )}
    </Box>
  )
  // A home section: a titled card, as the tiles are, so each reads apart from the next.
  const card = (key: string, title: string, body: JSX.Element) => (
    <Box key={key} flexDirection="column" gap={1} borderStyle="round" borderDimColor paddingX={1}>
      <Text dimColor>{title}</Text>
      {body}
    </Box>
  )
  const act = ready(snap?.activity)
  const fol = ready(snap?.followers)
  const top = ready(snap?.topPosts)
  const weak = ready(snap?.attention)
  const lastDay = act?.posts.at(-1)?.day ?? fol?.at(-1)?.day
  const when = (day: string) => `${shortDay(day)}${day === lastDay ? ' (so far)' : ''}`
  const points = (days: readonly PdDay[], unit: string) =>
    days.map(d => ({ label: `${when(d.day)} · ${grouped(d.value)} ${unit}`, value: d.value }))

  const firstDay = act?.posts[0]?.day
  const span = firstDay && lastDay ? `${shortDay(firstDay)} – ${shortDay(lastDay)}` : ''
  const tile = (key: string, title: string, value: string | undefined, delta: string | undefined, body: JSX.Element, caption?: string) => (
    <Box key={key} flexDirection="column" flexGrow={1} minWidth={24} borderStyle="round" borderDimColor paddingX={1}>
      <Text dimColor>{title}</Text>
      <Box flexDirection="row" columnGap={1}>
        <Text bold>{value ?? '—'}</Text>
        {delta ? <Text color={delta.startsWith('-') ? 'error' : 'success'}>{delta}</Text> : null}
      </Box>
      {body}
      {caption ? <Text dimColor>{caption}</Text> : null}
    </Box>
  )

  const ordered = list ? orderByRecent(list, data.recent) : null
  const isRecent = (d: PdDataset) => data.recent.includes(d.id)
  const picker =
    Select ? (
      list && list.length > 0 ? (
        <Select
          key="dataset"
          label="Dataset"
          options={(ordered ?? []).map(d => ({ value: String(d.id), label: label(d) }))}
          value={pinnedDataset ? String(pinnedDataset.id) : undefined}
          onSelect={v => void actions.pin(list.find(d => String(d.id) === v) ?? null)}
        />
      ) : null
    ) : (
      <Box key="datasets" flexDirection="column">
        <Text dimColor>{`Your datasets${list ? ` (${list.length})` : ''}: press one to work in it`}</Text>
        {(ordered ?? []).flatMap((d, i) => [
          ...(i === 0 && isRecent(d) ? [<Text key="recent-label" dimColor>Recent</Text>] : []),
          ...(!isRecent(d) && (i === 0 || isRecent(ordered![i - 1])) && data.recent.length > 0
            ? [<Text key="all-label" dimColor>All</Text>]
            : []),
          <Button
            key={`ds-${d.id}`}
            plain
            label={`${d.id === pinnedDataset?.id ? '●' : '○'} ${label(d)} #${d.id}`}
            onPress={() => actions.pin(d)}
          />,
        ])}
      </Box>
    )

  const homeBody = (
    <Box key="home" flexDirection="column" gap={2}>
        {picker}

        {current && (
          <Box flexDirection="row" flexWrap="wrap" columnGap={2} rowGap={1}>
            {tile(
              'posts',
              'POSTS',
              g && grouped(g.posts.value),
              g?.posts.deltaLabel,
              act ? chart('chart-posts', points(act.posts, 'posts'), 'Posts per day, last 14 days', 'blue') : pending('chart-posts', snap?.activity)!,
              act ? `posts per day · ${span}` : undefined,
            )}
            {tile(
              'followers',
              'FOLLOWERS',
              g && compact(g.followers.value),
              g?.followers.deltaLabel,
              fol ? (
                fol.length > 0 ? (
                  chart(
                    'chart-followers',
                    fol.map(d => ({ label: `${when(d.day)} · ${signed(d.value)} since ${shortDay(fol[0].day)}`, value: d.value })),
                    'Followers gained since the first day, last 14 days',
                    'aqua',
                    'line',
                  )
                ) : (
                  <Text key="chart-followers" dimColor>No follower history yet.</Text>
                )
              ) : (
                pending('chart-followers', snap?.followers)!
              ),
              fol && fol.length > 0 ? `followers gained since ${shortDay(fol[0].day)}` : undefined,
            )}
            {tile(
              'accounts',
              'ACCOUNTS POSTING',
              g && grouped(g.activeAccounts.value),
              g?.activeAccounts.deltaLabel,
              act
                ? chart('chart-accounts', points(act.accounts, 'accounts posting'), 'Accounts posting per day, last 14 days', 'violet')
                : pending('chart-accounts', snap?.activity)!,
              act ? `accounts posting per day · ${span}` : undefined,
            )}
          </Box>
        )}
        {current && g && (
          <Text dimColor wrap="wrap">
            {`Views ${compact(g.views.value)} (${g.views.deltaLabel}) · Accounts ${grouped(g.accounts.value)} · Creators ${grouped(g.creators.value)}`}
          </Text>
        )}

        {current && g && g.platforms.length > 0 && (
          <Box key="platforms" flexDirection="column" gap={1}>
            <Text dimColor>POSTS BY PLATFORM · change vs. 7 days ago</Text>
            {Svg ? (
              <Svg
                source={mixSvg(g.platforms.map(x => ({ platform: x.platform, posts: x.posts.value })))}
                alt={`Posts by platform: ${g.platforms.map(x => `${x.platform} ${share(x.posts.value)}`).join(', ')}`}
                isInteractive
              />
            ) : (
              <Box flexDirection="row">
                {apportion(g.platforms.map(x => x.posts.value), 32).map((n, i) => (
                  <Text key={`bar-${g.platforms[i].platform}`} color={dot(g.platforms[i].platform)}>
                    {'█'.repeat(n)}
                  </Text>
                ))}
              </Box>
            )}
            <Box flexDirection="row" flexWrap="wrap" columnGap={3} rowGap={1}>
              {g.platforms.map(x => (
                <Box key={`platform-${x.platform}`} flexDirection="column" minWidth={12}>
                  <Box flexDirection="row" columnGap={1}>
                    <Text color={dot(x.platform)}>●</Text>
                    <Text>{x.platform}</Text>
                  </Box>
                  <Box flexDirection="row" columnGap={1}>
                    <Text bold>{compact(x.posts.value)}</Text>
                    <Text dimColor>{share(x.posts.value)}</Text>
                  </Box>
                  {x.posts.deltaLabel ? (
                    <Text color={x.posts.deltaLabel.startsWith('-') ? 'error' : 'success'}>{x.posts.deltaLabel}</Text>
                  ) : null}
                </Box>
              ))}
            </Box>
          </Box>
        )}

        {current &&
          card(
            'top',
            'TOP POSTS THIS WEEK',
            pending('top-state', snap?.topPosts) ??
              (top && top.length === 0 ? (
                <Text dimColor>No posts in the last 7 days.</Text>
              ) : (
                <Box flexDirection="column" gap={2}>
                  {(top ?? []).map((p, i) => postRow(p, i))}
                </Box>
              )),
          )}

        {current &&
          card(
            'weak',
            'NEEDS ATTENTION',
            pending('weak-state', snap?.attention) ??
              (weak && weak.length === 0 ? (
                <Text dimColor>Nothing flagged.</Text>
              ) : (
                <Box flexDirection="column" gap={2}>
                  {(weak ?? []).map(a => (
                    <Box key={`weak-${a.username}`} flexDirection="column">
                      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                        <Text bold>{`@${a.username}`}</Text>
                        <Text color={dot(a.platform)}>●</Text>
                        <Text dimColor>{a.platform}</Text>
                      </Box>
                      <Text dimColor>{`${plural(a.posts, 'post')} · ${compact(a.views)} ${a.views === 1 ? 'view' : 'views'}`}</Text>
                      <Box flexDirection="row" flexWrap="wrap" columnGap={1} marginTop={1}>
                        <Button
                          key={`account-${a.username}`}
                          label="Details"
                          onPress={() => actions.show({ kind: 'account', account: { username: a.username, platform: a.platform } })}
                        />
                        <Button key={`look-${a.username}`} label="Ask Claude: look into it" onPress={() => actions.ask(lookPrompt(current, a), `Look into @${a.username}`)} />
                      </Box>
                    </Box>
                  ))}
                </Box>
              )),
          )}

        {data.requests.length > 0 &&
          card(
            'requests',
            'REQUESTS TO CLAUDE',
            <Box flexDirection="column" gap={2}>
              {data.requests.slice(0, 3).map(r => (
                <Box key={`request-${r.id}`} flexDirection="column">
                  <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
                    <Text bold>{r.label}</Text>
                    <Text
                      color={r.status === 'answered' ? 'success' : r.status === 'stopped' ? 'warning' : undefined}
                      dimColor={r.status === 'sent'}
                    >
                      {REQUEST_STATUS[r.status]}
                    </Text>
                  </Box>
                  {r.answer ? <Text dimColor>{plainPreview(r.answer, 200)}</Text> : null}
                  {r.status === 'answered' && (
                    <Box flexDirection="row" marginTop={1}>
                      <Button key={`answer-${r.id}`} label="Show answer" onPress={() => actions.show({ kind: 'answer', requestId: r.id })} />
                    </Box>
                  )}
                </Box>
              ))}
            </Box>,
          )}

        {current &&
          card(
            'questions',
            'ASK CLAUDE',
            <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
              {QUESTIONS.map((q, i) => (
                <Button key={`question-${i}`} label={q.label} onPress={() => actions.ask(q.ask(current), q.label)} />
              ))}
            </Box>,
          )}

        <Box flexDirection="row" flexWrap="wrap" columnGap={1} rowGap={1}>
          {current && <Button key="explore" label="Explore" variant="primary" onPress={() => actions.run('pd-intel-code:explore')} />}
          {current && <Button key="report" label="Write a report" onPress={() => actions.run('pd-intel-code:report')} />}
          <Button key="sources" label={`Sources used (${calls})`} onPress={() => actions.run('pd-evidence')} />
          <Button key="capture" label={`Save results for charts: ${isCapturing ? 'On' : 'Off'}`} onPress={() => actions.setCapture(!isCapturing)} />
        </Box>
    </Box>
  )

  const Markdown = els.Markdown
  const back = <Button key="back" label="← Back" onPress={() => actions.back()} />
  const tdy = today && current && today.datasetId === current.id ? today : null
  const todayBody = (
    <Box key="today-screen" flexDirection="column" gap={1}>
      {back}
      {pending('today-summary', tdy?.summary) ??
        (tdy && tdy.summary.status === 'ready' ? (
          <Box flexDirection="column" gap={1}>
            <Text dimColor>{`TODAY · summary for ${shortDay(tdy.summary.data.date)}`}</Text>
            <Markdown key="today-narrative" text={tdy.summary.data.narrative} />
          </Box>
        ) : null)}
      <Text dimColor>TOP POSTS THAT DAY</Text>
      {pending('today-posts', tdy?.posts) ??
        (tdy && tdy.posts.status === 'ready' ? (
          tdy.posts.data.length === 0 ? (
            <Text dimColor>No posts that day.</Text>
          ) : (
            <Box flexDirection="column" gap={1}>
              {tdy.posts.data.map((p, i) => postRow(p, i))}
            </Box>
          )
        ) : null)}
    </Box>
  )

  // Only the open post's or account's own data, for the dataset in use.
  const pv =
    sc.kind === 'post' && current && data.postView?.postId === sc.post.id && data.postView.datasetId === current.id ? data.postView : null
  const postBody =
    sc.kind === 'post' && current ? (
      <Box key="post-screen" flexDirection="column" gap={1}>
        {back}
        {postRow(sc.post, 0)}
        {pending('post-detail', pv?.detail) ??
          (pv && pv.detail.status === 'ready' ? (
            <Box flexDirection="column">
              <Text>{`${plural(pv.detail.data.likes, 'like')} · ${plural(pv.detail.data.comments, 'comment')} · ${plural(pv.detail.data.shares, 'share')}`}</Text>
              <Text dimColor>{`${pv.detail.data.engagementRate.toFixed(2)}% engagement · posted ${shortDay(pv.detail.data.postedAt.slice(0, 10))}`}</Text>
              <Text dimColor>{pv.detail.data.url}</Text>
            </Box>
          ) : null)}
        {!pv?.comments ? (
          <Button key="load-comments" label="Load comment summary" onPress={() => actions.loadComments()} />
        ) : pv.comments.status === 'loading' ? (
          <Text dimColor>Loading — comment summaries can take a minute or two</Text>
        ) : pv.comments.status === 'failed' ? (
          <Text color="warning">{`Couldn't load this: ${pv.comments.message}`}</Text>
        ) : (
          <Text>
            {`${grouped(pv.comments.data.collected)} comments collected${pv.detail.status === 'ready' ? ` (the post shows ${grouped(pv.detail.data.comments)})` : ''} · ${grouped(pv.comments.data.commenters)} ${pv.comments.data.commenters === 1 ? 'person' : 'people'}`}
          </Text>
        )}
      </Box>
    ) : null

  const av =
    sc.kind === 'account' &&
    current &&
    data.accountView?.key === `${sc.account.platform}:${sc.account.username}` &&
    data.accountView.datasetId === current.id
      ? data.accountView
      : null
  const accountBody =
    sc.kind === 'account' && current ? (
      <Box key="account-screen" flexDirection="column" gap={1}>
        {back}
        <Box flexDirection="row" columnGap={1}>
          <Text bold>{`@${sc.account.username}`}</Text>
          <Text color={dot(sc.account.platform)}>●</Text>
          <Text dimColor>{sc.account.platform}</Text>
        </Box>
        {pending('account-stats', av?.stats) ??
          (av && av.stats.status === 'ready' ? (
            <Box flexDirection="column">
              <Text>{`${plural(av.stats.data.followers, 'follower')} · ${plural(av.stats.data.posts, 'post')} · active ${plural(av.stats.data.activeDays, 'day')}`}</Text>
              <Text dimColor>{`${viewsLabel(sc.account.platform, av.stats.data.views)} · ${plural(av.stats.data.likes, 'like')} · ${plural(av.stats.data.comments, 'comment')}`}</Text>
              <Text dimColor>{`${av.stats.data.engagementRate.toFixed(2)}% engagement · last post ${shortDay(av.stats.data.lastPost.slice(0, 10))}`}</Text>
            </Box>
          ) : null)}
        <Text dimColor>RECENT POSTS</Text>
        {pending('account-recent', av?.recent) ??
          (av && av.recent.status === 'ready' ? (
            av.recent.data.length === 0 ? (
              <Text dimColor>No posts found.</Text>
            ) : (
              <Box flexDirection="column" gap={1}>
                {av.recent.data.map((p, i) => postRow(p, i))}
              </Box>
            )
          ) : null)}
      </Box>
    ) : null

  const asked = sc.kind === 'answer' ? data.requests.find(r => r.id === sc.requestId) : undefined
  const answerBody =
    sc.kind === 'answer' ? (
      <Box key="answer-screen" flexDirection="column" gap={1}>
        {back}
        <Text dimColor>{asked?.text ?? 'This request is no longer in the list.'}</Text>
        {asked?.answer ? <Markdown key="answer-text" text={asked.answer} /> : null}
      </Box>
    ) : null

  return (
    <Box flexDirection="column" gap={1}>
      {line && <Text color="warning">{line}</Text>}

      <Box flexDirection="row" flexWrap="wrap" columnGap={1}>
        {pinnedDataset ? <Text bold>{label(pinnedDataset)}</Text> : <Text>No dataset chosen yet. Pick one and Claude will use it.</Text>}
        {snap && <Text dimColor>{`data as of ${shortDay(snap.fetchedOn)}`}</Text>}
        {current && sc.kind === 'home' && <Button key="today" label="Today" onPress={() => actions.show({ kind: 'today' })} />}
        <Button key="refresh" label="Refresh" onPress={() => actions.refresh()} />
      </Box>
      {sc.kind === 'today' && current ? todayBody : (postBody ?? accountBody ?? answerBody ?? homeBody)}

      {extra}
    </Box>
  )
}

// The panel as markdown: the /pd row the model reads, and what a surface that
// draws no plugin panels (the mobile app) shows in its place.
export function summary(list: readonly PdDataset[] | null, current: PdDataset | null, snap: PdSnapshot | null): string {
  const g = snap?.glance.status === 'ready' ? snap.glance.data : null
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
    const act = ready(snap?.activity)
    if (act) {
      const values = act.posts.map(d => d.value)
      lines.push(
        `- Posts per day, last ${values.length} days: ${grouped(Math.min(...values))} to ${grouped(Math.max(...values))}, ${grouped(values.at(-1) ?? 0)} so far today`,
      )
    }
    const top = ready(snap?.topPosts)
    if (top && top.length > 0) {
      lines.push(
        '',
        'Top posts this week:',
        ...top.map((p, i) => `${i + 1}. @${p.author} on ${p.platform}: "${oneLine(p.text, 80)}" (${compact(p.views)} views, post ${p.postId})`),
      )
    }
    const weak = ready(snap?.attention)
    if (weak && weak.length > 0) {
      lines.push('', 'Needs attention:', ...weak.map(a => `- @${a.username} (${a.platform}): ${plural(a.posts, 'post')}, ${compact(a.views)} ${a.views === 1 ? 'view' : 'views'}`))
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

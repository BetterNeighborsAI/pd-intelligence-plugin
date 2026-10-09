import { expect, test } from 'claude-code/testing'

import { followersSql, isStale, orderByRecent, plainPreview, plural, platformName, pushRecent, requestDone, requestStarted, startRequest, toAccountStats, toCommentSummary, toPostDetail, toPosts, toSummary, toTopPosts, viewsLabel, lastDays, rowsOf, shortDay, toActivity, toAttention, toFollowers } from './data'

test('days run oldest first, across month ends', async () => {
  const days = lastDays('2026-10-09')
  expect(days.length).toBe(14)
  expect(days[0]).toBe('2026-09-26')
  expect(days.at(-1)).toBe('2026-10-09')
  expect(lastDays('2026-03-01', 3)).toEqual(['2026-02-27', '2026-02-28', '2026-03-01'])
  expect(shortDay('2026-10-02')).toBe('Oct 2')
})

test('SQL answers become rows by column name', async () => {
  expect(rowsOf({ columns: ['a', 'b'], rows: [[1, 2]] })).toEqual([{ a: 1, b: 2 }])
  expect(() => rowsOf({ result: [] })).toThrow()
})

test('activity fills empty days with zero', async () => {
  const days = lastDays('2026-10-09')
  const a = toActivity(
    [
      { day: '2026-10-01T00:00:00', platform: 'instagram', posts: 10, accounts: 2 },
      { day: '2026-10-08T00:00:00', platform: 'x_twitter', posts: 40, accounts: 9 },
      { day: '2026-10-09T00:00:00', platform: 'x_twitter', posts: 53, accounts: 11 },
      { day: '2026-10-09T00:00:00', platform: 'youtube', posts: 2, accounts: 1 },
    ],
    days,
  )
  expect(a.posts.length).toBe(14)
  expect(a.posts[0]).toEqual({ day: '2026-09-26', value: 0 })
  expect(a.posts.find(d => d.day === '2026-10-01')?.value).toBe(10)
  expect(a.posts.at(-1)).toEqual({ day: '2026-10-09', value: 55 })
  expect(a.accounts.at(-1)).toEqual({ day: '2026-10-09', value: 12 })
})

test('followers are the change since the first day, carried over gaps', async () => {
  const days = ['2026-10-07', '2026-10-08', '2026-10-09']
  const rows = [
    { day: '2026-10-07T00:00:00', followers: 1000 },
    { day: '2026-10-09T00:00:00', followers: 1250 },
  ]
  expect(toFollowers(rows, days).map(d => d.value)).toEqual([0, 0, 250])
  expect(toFollowers([], days)).toEqual([])
})

test('accounts needing attention ignore hidden-likes engagement', async () => {
  const weak = toAttention({
    result: [{ author_username: 'quietacct', platform: 'instagram', total_posts: 53, total_views: 2245, total_likes: -53, engagement_rate: -0.27 }],
  })
  expect(weak).toEqual([{ username: 'quietacct', platform: 'Instagram', posts: 53, views: 2245 }])
})

test('a snapshot is stale on a later day or with any section not ready', async () => {
  const ok = { status: 'ready', data: [] } as const
  const snap = { datasetId: 1, fetchedOn: '2026-10-09', glance: ok, activity: ok, followers: ok, topPosts: ok, attention: ok } as never
  expect(isStale(snap, '2026-10-09')).toBe(false)
  expect(isStale(snap, '2026-10-10')).toBe(true)
  expect(isStale({ ...(snap as object), followers: { status: 'failed', message: 'x' } } as never, '2026-10-09')).toBe(true)
})

test('days before any follower history are left out, not counted as zero', async () => {
  const days = ['2026-10-07', '2026-10-08', '2026-10-09']
  const rows = [
    { day: '2026-10-07T00:00:00', followers: null },
    { day: '2026-10-08T00:00:00', followers: 1000 },
    { day: '2026-10-09T00:00:00', followers: 1010 },
  ]
  expect(toFollowers(rows, days)).toEqual([{ day: '2026-10-08', value: 0 }, { day: '2026-10-09', value: 10 }])
})

test('the followers sum covers only accounts with a count by the first day', async () => {
  expect(followersSql('2026-09-26', '2026-10-09')).toContain("FROM snaps WHERE day <= DATE '2026-09-26'")
})

test('counts read as words, and every tracked platform has its proper name', async () => {
  expect(plural(1, 'post')).toBe('1 post')
  expect(plural(2767, 'view')).toBe('2,767 views')
  expect(platformName('threads')).toBe('Threads')
  expect(platformName('bluesky')).toBe('Bluesky')
})

test('the daily summary keeps its narrative and day; posts keep their internal id', async () => {
  expect(toSummary({ narrative_text: '## Day', summary_date: '2026-10-08' })).toEqual({ date: '2026-10-08', narrative: '## Day' })
  expect(() => toSummary({ narrative_text: null })).toThrow()
  expect(toPosts({ items: [{ id: 7, post_id: 'p7', platform: 'threads', author_username: 'bo', post_text: null, views: 0, content_type: 'video' }] })).toEqual([
    { id: 7, postId: 'p7', platform: 'Threads', author: 'bo', text: '', views: 0, contentType: 'video' },
  ])
  expect(toTopPosts([{ id: 9, post_id: 'p9', platform: 'instagram', author_username: 'a', text: 't', views: 5, content_type: 'sidecar' }])[0]).toMatchObject({ id: 9, contentType: 'sidecar' })
})

test('post detail and comment summary read the fields the panel shows', async () => {
  expect(
    toPostDetail({ views: 10, likes: 2, comments: 1863, shares: 0, engagement_rate: 11.24, post_timestamp: '2026-10-06T13:46:21Z', post_url: 'https://x/p', content_type: 'video' }),
  ).toEqual({ views: 10, likes: 2, comments: 1863, shares: 0, engagementRate: 11.24, postedAt: '2026-10-06T13:46:21Z', url: 'https://x/p', contentType: 'video' })
  expect(
    toCommentSummary({ summary_stats: { total_comments: 42, total_commenters: 40, author_reply_count: 1 }, timeline: [{ date: '2026-10-07', count: 13 }] }),
  ).toEqual({ collected: 42, commenters: 40, authorReplies: 1, byDay: [{ day: '2026-10-07', value: 13 }] })
})

test('an account is picked by handle and platform, or said to be missing', async () => {
  const parsed = {
    items: [
      { author_username: 'cg', platform: 'threads', followers_count: 0, total_posts: 11 },
      { author_username: 'cg', platform: 'instagram', followers_count: 3, total_posts: 89, total_views: 7936, total_likes: 161, total_comments: 2, engagement_rate: 2.05, first_post: '2025-07-25T15:07:49Z', last_post: '2026-10-08T19:10:52Z', active_days: 53 },
    ],
  }
  expect(toAccountStats(parsed, { username: 'cg', platform: 'Instagram' })).toMatchObject({ followers: 3, posts: 89, activeDays: 53 })
  expect(() => toAccountStats(parsed, { username: 'cg', platform: 'TikTok' })).toThrow(/No account @cg on TikTok/)
})

test('a zero a platform never publishes reads as such, not as no views', async () => {
  expect(viewsLabel('Threads', 0)).toBe('views not published')
  expect(viewsLabel('Instagram', 0, 'sidecar')).toBe('views not published')
  expect(viewsLabel('Instagram', 0, 'video')).toBe('0 views')
  expect(viewsLabel('Threads', 216)).toBe('216 views')
  expect(viewsLabel('X', 1)).toBe('1 view')
})

test('recent datasets lead the list, most recent first', async () => {
  expect(pushRecent([3, 1], 1)).toEqual([1, 3])
  expect(pushRecent([1, 2, 3, 4, 5], 6)).toEqual([6, 1, 2, 3, 4])
  const list = [1, 2, 3, 4].map(id => ({ id, name: `D${id}`, icon: '' }))
  expect(orderByRecent(list, [3, 9, 1]).map(d => d.id)).toEqual([3, 1, 2, 4])
})

test('a request is matched to its turn once, then to its answer', async () => {
  const sent = startRequest([], { id: 'r1', label: 'Why?', text: 'Q', status: 'sent', at: 't' })
  const twice = startRequest(sent, { id: 'r2', label: 'Why?', text: 'Q', status: 'sent', at: 't' })
  const working = requestStarted(twice, 'Q', 'turn-1')
  expect(working.map(r => r.status)).toEqual(['sent', 'working'])
  expect(requestStarted(working, 'something typed', 'turn-2')).toEqual(working)
  const done = requestDone(working, 'turn-1', 'The answer', false)
  expect(done.find(r => r.id === 'r1')).toMatchObject({ status: 'answered', answer: 'The answer' })
  expect(requestDone(working, 'turn-1', '', true).find(r => r.id === 'r1')?.status).toBe('stopped')
  expect(startRequest(Array.from({ length: 10 }, (_, i) => ({ ...sent[0], id: `x${i}` })), sent[0]).length).toBe(10)
})

test('an answer preview is plain text, cut short', async () => {
  expect(plainPreview('## Why it worked\n\nThe **hook** landed — see [the post](https://x/p).', 200)).toBe('Why it worked The hook landed — see the post.')
  expect([...plainPreview('x'.repeat(300), 200)].length).toBe(200)
})

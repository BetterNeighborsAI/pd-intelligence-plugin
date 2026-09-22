---
name: pd-intel-tagging
description: Use when labelling, organizing, or curating PD Intelligence data — creating a tag, renaming or recoloring one, tagging or untagging posts, accounts, creators, comments or commenters in bulk, building a cohort or campaign label, cleaning up a dataset's tags, or asking "how do I tag these" and "what tags do we have". Covers the write tools create_tag, update_tag, delete_tag and tag_entities, their permission gates, and the inheritance rule that makes bulk tagging cheap.
---

# PD Intelligence — Tagging & Curation

Tags are how a dataset gets organized: cohorts, campaigns, themes, watchlists.
This skill covers the **write** side. Filtering by existing tags is covered in
the read skills.

These tools change shared data. Confirm before you write.

## Before writing anything

1. `list_datasets`, then pass the integer `id` everywhere.
2. `list_tags` (use `query` to search by name) to see what already exists.
   **Reuse an existing tag rather than creating a near-duplicate** — "SNAP",
   "snap", and "SNAP Campaign" as three tags is the most common mess these
   tools create.
3. Resolve the entities you intend to tag to their **internal `id`s** with the
   search tools first. Never guess an id.

### `list_tags` returns two tag systems — only one is writable

Results carry a `tag_type` of `"permanent"` or `"clai"`. The write tools work
on **permanent tags only**, and the two systems have **separate id
namespaces**, so a CLAI tag's `id` may collide with an unrelated permanent
tag's id.

**Filter to `tag_type == "permanent"` before passing any id to `tag_entities`,
`update_tag`, or `delete_tag`.** A CLAI id is either rejected as unknown or, on
a collision, silently applies the wrong tag.

## Permissions — check before promising

| Action | Needs |
|---|---|
| Create/edit/apply a **personal** tag (`scope_type: "user"`) | dataset access only |
| Create/edit/apply a **dataset** tag (shared with the team) | the `tags_manage` capability |
| Anything **global**, or editing someone else's tag | system admin |

You cannot read a user's capabilities from the tools. Attempt the call and
report the refusal plainly — do not tell the user they lack permission before
the server says so, and do not silently fall back to a personal tag when they
asked for a shared one.

## Creating a tag

```
create_tag(dataset_id, name, scope_type="user", color=None, description=None)
```

**`scope_type` defaults to `"user"`, which is private to the caller.** This is
the single most common mistake with this tool: a tag created for the team is
invisible to the team. If the user says "our", "the team's", "so everyone can
filter by it", or is building a shared cohort, pass `scope_type: "dataset"`.
If they are sketching something for their own use, the default is right — say
which one you used either way.

Names must be unique within their scope. Add a `description` when the tag's
meaning isn't obvious from its name; future filtering depends on it.

## Applying tags — tag the parent, not the children

```
tag_entities(dataset_id, entity_type, entity_ids, tag_ids, mode="add")
```

`entity_type` is `"post"`, `"account"`, `"creator"`, `"comment"` or
`"commenter"`; all ids in one call must be the same type. `mode` is `"add"` or
`"remove"`.

**This writes direct assignments only, but reads inherit down the chain
creator → account → post.** So tagging one creator makes every one of their
accounts and every post on those accounts match that tag in the search tools.

Before tagging a large batch of posts, ask what the tag actually means:

| The tag describes | Tag this | Not this |
|---|---|---|
| A person, cohort, program, or roster | the **creator** | their hundreds of posts |
| A handle, channel, or platform presence | the **account** | its posts |
| A specific piece of content, topic, or moment | the **posts** | — |

Tagging 400 posts to express "these are Cohort 3 creators" is wrong as well as
slow: it doesn't survive new posts, while a creator tag applies to future posts
automatically.

The call is additive and idempotent — re-adding an existing tag is a no-op, as
is removing one that was never there. It is also all-or-nothing on visibility:
ids you cannot see are rejected outright, so `list_tags` first.

Check `updated_count` in the response against the number of entities you sent.
A lower number means some rows already had the tag, which is fine, but say so
rather than reporting a bigger change than happened.

### Bulk workflow

1. Find the entities (`search_posts`, `search_creators`, `search_accounts`, …)
   and collect their internal `id`s. Use the result `total` to know the real
   size of the set — not the page you fetched.
2. **Show the user what you are about to tag and how many, and get a yes.**
   For a large or hard-to-review set, list a sample and the count.
3. Call `tag_entities` in batches, then verify with `list_tags` (`usage_count`)
   or a filtered search on the new tag.

## Editing and removing

- `update_tag` changes only the fields you pass; assignments survive untouched.
  Moving a tag between scopes needs permission in the **target** scope, so
  promoting a personal tag to a dataset tag needs `tags_manage`.
- **`delete_tag` destroys the tag and every assignment of it, permanently.**
  Confirm explicitly, and quote `usage_count` from `list_tags` so the user
  knows how many assignments are about to disappear.
- To take a tag off some entities and keep the tag, use
  `tag_entities(mode="remove")`. Reach for this first — it is the reversible
  option, and it is usually what "remove the tag from these" actually means.

## Standards

- **Never tag speculatively.** If the user hasn't said what the label means,
  ask. A wrong tag propagates through inheritance into every future search.
- **Confirm before bulk writes and before any delete**, with counts.
- **Report what changed**: tag name, scope, entity type, how many entities, and
  `updated_count` — not "done".
- **Say which scope you created**, so nobody discovers later that the team tag
  was private all along.

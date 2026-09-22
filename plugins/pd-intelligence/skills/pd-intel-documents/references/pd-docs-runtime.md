# The PD Docs runtime contract

Every HTML document PD Docs renders runs inside a sandboxed iframe with exactly
one permission: `allow-scripts`. Not `allow-same-origin`, not `allow-forms`, not
`allow-popups`.

That single line decides what a published document can and cannot do, and it is
not negotiable — handing uploaded HTML the app origin would hand it the app's
cookies, storage and Firebase session. Assume it applies everywhere: the
dashboard viewer, the editor preview, the standalone PD Docs reader, the
fullscreen dialog, and explorer thumbnails.

## What this means for a document you are about to publish

| Capability | Works? | What to do about it |
|---|---|---|
| `<script>`, CDN loads | **yes** | D3 and three.js are viable, WebGL included. Pin exact versions. |
| WebGL / canvas | **yes** | Budget for low-end laptops; provide a static fallback. |
| `localStorage`, `sessionStorage`, IndexedDB | **no — they throw** | The origin is opaque, so *reading* one raises `SecurityError`. An unguarded access at load time blanks the entire document. Keep all state in memory. |
| `document.cookie` | no | No persistence of any kind is available. |
| `<form>` submission | no | Build inputs as scripted controls, never a form. |
| `window.open`, `target="_blank"` | **blocked** | A cited link opens nothing at all. |
| A plain `<a href>` | navigates **the frame itself** | The reader loses your document and has no back button. |
| Body size | 5 MB UTF-8 | Check before publishing; inline assets add up fast. |

## The two rules that catch people

**1. Never let a link be the only copy of a source URL.** This is the one that
silently ruins reports. Every post you cite carries a `post_url`, and in PD Docs
that URL cannot open a tab. Render it as visible, selectable text next to the
claim — `@handle · 2026-08-14 · intel.example/p/123` — so a reader can copy it.
An anchor whose text is "source" is worse than useless here: it looks
clickable, does nothing when clicked, and hides the URL it was standing in for.

**2. Never touch storage, not even defensively.** A library that probes
`localStorage` on load takes the document down with it. If you must use one,
wrap the access:

```js
let saved = null;
try { saved = localStorage.getItem("view"); } catch { /* opaque origin */ }
```

## Choosing a mime type

- `text/html` — self-contained reports, decks, anything interactive. The
  default on create, and the only type this contract applies to.
- `text/markdown` — briefings and writeups. Rendered as prose, no scripts, none
  of the constraints above.
- `text/plain` — anything else.

`publish_document` defaults to `text/html` on **create**, so set it explicitly
for markdown or the dashboard renders it wrong. On **update**, omitting
`mime_type` leaves the document's type alone; passing one converts it.

## Before you publish

Render the document in a browser inside an iframe carrying the same sandbox and
click through it:

```html
<iframe sandbox="allow-scripts" srcdoc="..."></iframe>
```

What to look for: does it render at all (a storage throw shows as a blank
frame), do the charts draw, does the console show a blocked-API error, and can
a reader still get at every source URL you cited.

## One surface differs

The legacy direct-serve route `/d/{token}` sends its sandbox as a CSP header
with `allow-scripts allow-popups`, so links *can* open there. Do not design for
it — every in-app surface, including the PD Docs reader people actually receive,
is the stricter `allow-scripts`. Build for the strict case and the permissive
one takes care of itself.

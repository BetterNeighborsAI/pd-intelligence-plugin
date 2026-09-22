# Format: interactive document

For a document where the reader should *do* something — filter a cohort, hover
a series, compare two periods, scrub a timeline, or turn a structure around in
three dimensions. Published as `mime_type: "text/html"`, self-contained, one
file.

## First, does interactivity earn its place

Interaction costs the reader attention and costs you a fallback. It pays when
the data has more dimensions than a page has room for, when different readers
need different slices, or when a shape is genuinely spatial. It does not pay for
a single series over time, a ranking of eight things, or a comparison of two
numbers — those are stronger as a well-annotated static chart, and a static
chart never breaks.

The honest test: if you cannot name the question a reader answers by clicking,
there is no interaction to build. Make it a chart.

## The sandbox decides your architecture

PD Docs renders the document with `sandbox="allow-scripts"` and nothing else.

- **Scripts and CDN libraries load.** D3 and three.js both work, WebGL included.
- **All storage throws.** `localStorage`, `sessionStorage` and IndexedDB raise
  in an opaque origin — reading one at load time blanks the document. Hold every
  bit of state in a plain JS variable. There is no "remember my filter".
- **No forms.** Build controls as `<button>`, `<input type="range">` and
  scripted `<select>` handlers, never inside a `<form>`.
- **No new tabs.** Any source URL must also appear as visible text.

## Loading libraries

Never carry a version over from an example or from memory. Libraries move
faster than this skill does, and inside the sandbox a wrong URL fails silently.

**Find a version that is already working, rather than guessing one.** PD Docs is
full of documents rendering under this exact sandbox right now — so read one:
`list_documents` finds the published HTML, `read_document` shows its import map
and script tags. A version live in a PD Docs document is proof, not a guess.
Fall back to picking the current release only if you find nothing.

**D3** ships a UMD build that defines `window.d3`. Load it with a plain script
tag before your own:

```html
<script src="https://cdn.jsdelivr.net/npm/d3@VERSION/dist/d3.min.js"></script>
```

**three.js** ships as ES modules — recent releases dropped the UMD build, so an
older `three.min.js` snippet 404s and leaves a blank frame. Use an import map,
and **map `three/addons/` as well**: `OrbitControls`, `EffectComposer`,
`UnrealBloomPass` and everything else under `examples/jsm/` will not resolve
without it, which is the most common way a three.js document dies.

```html
<script type="importmap">
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@VERSION/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@VERSION/examples/jsm/"
  }
}
</script>
<script type="module">
  import * as THREE from "three";
  import { OrbitControls } from "three/addons/controls/OrbitControls.js";
</script>
```

For a library with no ESM build of its own, jsDelivr will convert one — append
`/+esm` to the package path and import it by name through the same map.

Google Fonts work normally: `fonts.googleapis.com` stylesheets and their
`fonts.gstatic.com` font files both load inside the sandbox.

**Then verify the URL actually resolves, by rendering the document before you
publish.** This matters more here than anywhere else you load a library: inside
the sandbox a wrong path fails *silently*. No error reaches the reader, none
reaches the author — just an empty document. Load the page, open the console,
and confirm the module is really there before you call it done.

## Your document runs inside an iframe

Every PD Docs surface frames the document, and readers scroll the page *around*
it. So a document that binds the wheel for its own navigation fights the reader
for control of the page.

Detect it and adapt, rather than assuming you own the viewport:

```js
if (window.self === window.top) {
  window.addEventListener("wheel", advance, { passive: true });
  hint.textContent = "Scroll or drag";   // affordance matches what actually works
}
```

Keyboard and pointer interaction work identically either way — it is only
scroll that needs the guard. Say what actually works in the hint text, since
the same document says different things depending on where it is opened.

## Build it to degrade

Write the document so it is readable with zero JavaScript, then enhance. A
blocked CDN, an offline reader, or a typo in a URL then costs you interactivity
instead of the entire report.

```html
<figure id="trend">
  <table><!-- the real numbers, always present --></table>
  <figcaption>Views by week, Jan–Mar 2026.</figcaption>
</figure>
<script>
  // Replace the table with the interactive chart only once the library is up.
  if (window.d3) { renderChart(document.getElementById("trend")); }
</script>
```

This is not a nicety. It is the difference between a reader seeing your numbers
and a reader seeing an empty box.

## Motion and accessibility

- **Honour `prefers-reduced-motion`.** Transitions and auto-rotating scenes
  cause real harm to some readers.

  ```js
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  ```

- **Every hover has a keyboard equivalent.** Make interactive marks focusable
  (`tabindex="0"`) and handle Enter and arrow keys. A reader on a keyboard
  should reach every value a mouse reaches.
- **Never encode meaning in colour alone** — pair it with position, shape, or a
  direct label.
- **Label the live region.** When a filter changes what is shown, say what is
  shown now in text, not only in the picture.

## WebGL and three.js specifics

- **Let renderer construction fail, and catch it.** This is stronger than
  probing for a context: it also catches a driver refusing, a blocked GPU, and
  a renderer that cannot allocate. Put the document into a declared no-GL state
  and let CSS hide the canvas and everything that only makes sense with it.

  ```js
  let renderer = null;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  } catch (e) {
    stage.classList.add("no-gl");     // CSS hides #gl and the drag hint
  }
  ```

  Then guard the animation loop on `renderer` rather than assuming it exists, so
  a no-GL reader still gets the text, the captions, and the numbers.

- **Budget for a laptop on battery.** Cap `renderer.setPixelRatio` at 2, keep
  geometry counts modest, and stop the animation loop when the frame is hidden
  (`document.hidden`) so a backgrounded tab does not burn the reader's battery.
- **Dispose what you create** — geometries, materials, textures — if the scene
  is ever rebuilt. Leaks show up as a document that gets slower the longer it is
  open.
- **3D must carry meaning.** A rotating globe that encodes nothing is decoration
  competing with your argument. Use three dimensions when the third dimension is
  real: spatial data, network structure, a surface over two variables.

## Before publishing

Render into a matching frame and use it the way a reader would:

```html
<iframe sandbox="allow-scripts" srcdoc="..."></iframe>
```

Blank frame means a storage access or a failed import. Then check: does the
no-JS fallback show real numbers, does every control work by keyboard, does it
respect reduced motion, is every source URL readable as text, and is the file
under 5 MB.

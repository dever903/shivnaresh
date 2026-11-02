# Deep analysis — "Cyberpunk hero section" prompt

Scope: read the prompt as a build contract, verify every measurable claim, find where it
contradicts itself or under-specifies, and record what the implementation does about each one.
Line references are to `src/App.tsx` unless stated otherwise.

---

## 1. What the prompt actually asks for

A **one-screen, one-section product page** — not a full site. Five stacked layers + a nav:

| # | Layer | z | Owns |
|---|-------|---|------|
| 1 | 48px grid SVG | 0 | mouse parallax, lerp 0.06 |
| 2 | Portrait A (red-lit, black zip jacket) | 10 | Ken Burns 2.4 s intro |
| 3 | Scrim (added, see D-07) | 35 | text contrast |
| 4 | Portrait B (cyberpunk face plates + glowing seams) | 30 | radial mask driven by a canvas |
| 5 | Stats arc | 50 | 3 arcs, 3 readouts, draw-in |
| 6 | Hero copy + CTA | 50 | staggered `hero-rise` |
| — | Fixed nav | 50 (root ctx) | 1 pill on desktop, 2 pills + sheet on mobile |

The concept: the *same* subject photographed in two states — organic and augmented. The cursor
is the "window" promised in the headline. That is the entire interaction thesis, and every
technical choice should serve it. Most of the defects below are places where the letter of the
spec works against that thesis.

---

## 2. Stack & constraint audit

- React 18 / Vite / TypeScript / Tailwind / `lucide-react` (`Menu`, `X` only). **Respected** — no
  extra runtime deps. Tailwind is pinned to **v3** (`tailwind.config.js` + `postcss.config.js`),
  because the class set (`bg-white/10`, arbitrary `tracking-[-0.08em]`) plus a plain
  `@tailwind base` entry assumes the v3 pipeline; v4 would need `@import "tailwindcss"` and the
  `@tailwindcss/vite` plugin instead.
- "No other packages" quietly forbids `clsx`, `framer-motion`, `@tailwindcss/typography`. All
  conditional class strings are therefore inline ternaries; all motion is CSS keyframes plus one
  rAF loop. That is the correct trade — every animation here is declarative and does not need JS.
- The spec never says what `main.tsx` / `index.html` contain. Missing setup (Vite config, entry,
  tsconfig strictness) is assumed and supplied.

---

## 3. Geometry — verified, not eyeballed

Centre `C = (-110, 300)` in a `0 0 380 700` viewBox, angles in SVG space (y down), so negative
angles are *above* the centre line. Every arc is a `A r r 0 0 1` sweep (large-arc-flag **0** is
correct: max sweep is 116° < 180°).

| arc | r | θ from→to | start point | end point | arc length `r·Δθ` |
|-----|-----|-----------|-------------|-----------|-------------------|
| 1 | 330 | −92° → 16° | (−121.52, −29.80) | (207.22, 390.96) | **622.04** |
| 2 | 395 | −56° → 60° | (110.88, −27.47) | (87.50, 642.08) | **799.71** |
| 3 | 460 | −14° → 72° | (336.34, 188.72) | (32.15, **737.49**) | **690.45** |

Dot positions (`dot + (16,4)` for the number, `+ (18,22)` for the label):

| stat | θ | dot | number origin | label origin | label right edge |
|------|---|-----|---------------|--------------|------------------|
| 10+ / YEARS REAL | −46° | (119.24, 62.62) | (135.24, 66.62) | (137.24, 84.62) | ≈ 208 |
| 40+ / USE FORMS | 2° | (284.76, 313.79) | (300.76, 317.79) | (302.76, 335.79) | ≈ 367 |
| 95% / REPEAT MEMBERS | 44° | (220.90, 619.54) | (236.90, 623.54) | (238.90, 641.54) | ≈ 338 |

Findings from the math:

1. **The outer arc is clipped by its own viewBox.** `r = 460` at 72° lands at `y ≈ 737.5`, 37.5
   units below the 700-tall box. The stroke is cut at `y = 700`, i.e. θ ≈ 60.4°, where the
   gradient has already fallen to ~10 % opacity — so the cut is invisible in practice. It is still
   a latent bug: change the last stop to `20 %` and a hard edge appears mid-air. Fix if the design
   is ever re-tuned: viewBox height `760`, or give the `r=460` arc `to = 60` and re-derive the dot.
2. **The longest label sets the right margin.** `REPEAT MEMBERS` at 8.5 px with 2 px tracking is
   ~99 units wide (mono advance ≈ 0.6 em + 2 px per glyph), but it is attached to the *inner-most
   dot* (x = 220.9), so it ends at ~338. The tightest case is actually `USE FORMS` on the
   r = 395 arc: it ends ≈ 367 of 380 — **13 units of headroom**. Any longer copy there (e.g.
   "AUGMENT FORMS") will overflow and be clipped. There is no `text-anchor` fallback in the spec.
3. **The arcs are pure `userSpaceOnUse` gradients.** Because `x1..y2` are the arc's own endpoints,
   the fade is *angular*, not radial — exactly what makes the sweep read as light falling off a
   surface instead of a stroked line.
4. `preserveAspectRatio="xMaxYMid meet"` + `h-full w-auto` means the drawing is right-anchored and
   scales with viewport height: at 900 px tall it is 489 px wide (34 % of a 1440 viewport). Every
   element inside — 32 px numerals, 8.5 px labels — scales with it, so type sizes are relative to
   screen height, not to CSS px. Two consequences: on a 1440×700 laptop the numerals render at
   25 px, and on a short-but-wide window the whole cluster shrinks. Acceptable for decoration,
   worth knowing before someone "fixes" font sizes in isolation.
5. **The 8.5 px labels are effectively unreadable.** At 1.0 scale, 8.5 px uppercase with 2 px
   tracking is below the accessible minimum and will alias on non-retina displays. It reads as
   texture rather than information — defensible as decoration (the arcs are `aria-hidden`), but
   the copy is real content ("95 % REPEAT MEMBERS"), so it deserves a text alternative. The
   `aria-hidden` SVG means that information exists *only* visually.

---

## 4. The spotlight — the one genuinely expensive decision

Spec: hidden full-window canvas → clear → fill radial gradient → `toDataURL()` → set as
`mask-image` **every frame**, mask radius 260 px, cursor lerp 0.1, start at (−999, −999).

Cost, measured against how the browser does it:

- A 1440×900 canvas is 1.3 MP. `toDataURL()` PNG-encodes it **synchronously on the main thread**
  — realistically 12–30 ms — then the browser must decode it, upload it as a texture, and
  rasterise the mask over the full element. That is a **30–45 fps ceiling** before React, the
  grid lerp, or the Ken Burns transform get a slice, and every frame blocks input handling.
- The encode also allocates a fresh base64 string (~1–4 MB of characters) per frame → GC pressure
  and sawtooth frame times, which is exactly the jank you feel on a trackpad.

Three fixes applied, in order of leverage:

1. **Paint the mask bitmap at ¼ resolution** (`SCALE = 0.25`). It is a six-stop soft gradient;
   bilinear upscaling with `mask-size: 100% 100%` is visually identical, and the PNG gets ~16×
   cheaper (~2–4 ms). This keeps the specified architecture intact.
2. **Skip the encode when the cursor has settled** (threshold 0.3 px on the smoothed position).
   Idle cost drops to one lerp + two `setAttribute` calls per frame. The rAF loop still runs
   (the grid needs it), but nothing is re-encoded.
3. **Structure for correctness**: the mask lives on an *untransformed* wrapper and the Ken Burns
   transform lives on an inner child (D-02). A mask on a scaled element is applied in local space,
   so the highlight would have drifted away from the real cursor during the 2.4 s intro.

The decisive alternative — worth stating because it makes the whole thing free: the same visual
is two `radial-gradient()` layers in `mask-image` with `mask-position` following the cursor.
No canvas, no encode, no texture upload, GPU-composited. The canvas path is only justified if the
reveal ever needs a shape a gradient cannot express (noise edges, per-pixel alpha, a hand-drawn
mask). If the design stays a plain radial falloff, the canvas is 30 lines of cost for nothing.
Kept as specified, since the brief is explicit, with the cost contained by (1) and (2).

Also unstated by the spec: **the effect does not exist on touch.** `pointermove` never fires, the
smoothed point stays at (−999, −999), and mobile visitors only ever see portrait A. Since the
whole page is one interaction, decide deliberately: either accept a static mobile hero (current,
coherent — the arcs are hidden there too, so mobile is a clean poster) or drive the spotlight on a
slow auto-orbit for touch. Do not leave it as an accident.

---

## 5. Animation timeline

| t (s) | event |
|-------|-------|
| 0.10 → 0.90 | nav pills drop in |
| 0.15 → 1.10 | eyebrow rises |
| 0.30 → 1.25 | H1 rises |
| 0.40 / 0.62 / 0.84 → 2.00 / 2.22 / 2.44 | arc strokes draw (inner → outer) |
| 0.50 → 1.45 | paragraph rises |
| 0.70 → 1.65 | CTA rises |
| 1.30 / 1.52 / 1.74 → 1.85 / 2.07 / 2.29 | dots pop |
| 1.60 / 1.82 / 2.04 → (infinite) | rings start pulsing |
| 2.40 | Ken Burns settles |

Everything resolves inside ~2.45 s, with the arcs still drawing while the copy finishes — good
overlap, no dead air. Two consequences of the `0.4 + i × 0.22` stagger worth knowing: the ring
pulse (`markDelay + 0.3`) begins *after* its own dot has popped but while the outer arc is still
drawing, and the three rings are permanently 0.22 s out of phase — a shimmmer rather than a
synchronised pulse. That is the nicer of the two outcomes; don't "fix" it.

`prefers-reduced-motion` resets all seven animation classes, including `stroke-dashoffset` →
`0`. Because `.hero-rise` and `.arc-text` start at `opacity: 0` and rely on `forwards` to become
visible, a naive reset that only kills `animation` would leave **invisible text**; the reset in
`index.css` sets `opacity: 1 !important` for exactly that reason.

---

## 6. Defect register

Severity: **S1** = visibly broken / wrong, **S2** = works but costs quality, **S3** = spec smell.

| ID | Sev | Issue | Resolution |
|----|-----|-------|------------|
| D-01 | S1 | **The CTA shine is invisible.** `via-white/60` sweeping across a `bg-white` button cannot be seen — 60 % white over 100 % white. The spec's own "shine sweep" is a no-op. | Sweep changed to `via-black/15`: a glint on white instead of a non-event. If the brief insists on white-on-white, the button must leave white (e.g. `bg-white/10` over the image). |
| D-02 | S1 | **Reveal layer would decouple from the cursor.** A `mask-image` on the Ken-Burns-scaled div is evaluated in the element's local space, so during the intro (scale 1.12 → 1) the lit circle sits up to ~7 % away from the pointer. Also the two portraits scale differently for 2.4 s, so the revealed image is mis-registered against the base. | Mask moved to an untransformed wrapper; both portraits run the identical `kenBurns` so the two frames stay pixel-registered throughout the intro. |
| D-03 | S1 | **Fixed nav vs. hero content stacking.** Nav is `z-50` in the root context; hero copy/stats are also `z-50` but inside a `position: relative` section that does not create a stacking context — so, at equal z, hero copy paints **above** the mobile dropdown (`z-40`). Opening the menu on a phone can leave "A window of coming enhancements" sitting on top of the white sheet. | `isolate` on the hero section scopes its z-indices; nav and sheet now sit above the whole hero, with the spec's numbers untouched. |
| D-04 | S2 | **`toDataURL()` per frame** — see §4. | Quarter-res bitmap + settle threshold. |
| D-05 | S2 | **Grid parallax is a sign-flipped depth cue.** Target = `(norm − 0.5) × 16` moves the grid *with* the cursor; a grid behind the subject should move *against* it (or at a smaller factor) to read as depth. As written it reads as the grid being glued to the pointer. | Kept as specified (16 px is small enough to be felt, not seen); flagged for design sign-off. |
| D-06 | S2 | **Arc 3 overflows its viewBox** (§3.1). | Left as spec'd; tail is already at ~10 % opacity. |
| D-07 | S2 | **"Everything must remain readable" is asserted but not implemented.** The portrait is a saturated red/orange field, ~`#f0602a` where the copy sits: white on that is ≈ **3.3 : 1** — below WCAG AA 4.5 for body text, and the paragraph is 14 px. The spec lists exactly five layers and no scrim, so the requirement cannot be met as drawn. | Added one `radial-gradient` scrim (z-35, bottom-left, 0.55 → 0): same red field, contrast lifts to ≈ **10 : 1**, and the brief's layer count becomes six. Cheapest honest fix. |
| D-08 | S2 | **Arc cluster collides with the headline below ~900 px wide.** `hidden sm:block` starts the arcs at 640 px, where the drawing is ~68 % of the viewport and the H1 is 448 px wide. | `max-w-[52vw]` on the SVG: the drawing scales down, stays right-anchored, stops reaching the copy. |
| D-09 | S3 | **`@font-face` for `HelveticaNeue-Roman` points at files that do not ship.** Guaranteed 404s on every load (harmless under `font-display: swap`, but noisy). | Declared as specified — the brief documents it as intentional ("declared but the mono font is what renders"). Drop the block, or ship the two files, before production. |
| D-10 | S3 | **`* { font-family }`** is a universal selector with 0 specificity. It works, it is also why nothing can ever inherit a different family by accident — and it silently overrides form-control and `font-mono` expectations. | Kept (the brief is explicit); `.font-helvetica-neue` exists as the documented escape hatch. |
| D-11 | S3 | **Copy is unresolved.** "40+ USE FORMS" and "10+ YEARS REAL" are not idiomatic English; "YEARS REAL" reads like a truncation of "YEARS REAL-WORLD" or "REAL YEARS IN PRACTICE". | Not changed — client copy. Flagged for sign-off. |
| D-12 | S3 | **`100dvh`** resizes as the mobile URL bar collapses, re-running `bg-cover` layout and the mask canvas. No layout thrash (single section), but the background re-fits mid-scroll. | Kept; `min-h-[100dvh]` would be the calmer choice for a scrolling page. |
| D-13 | S3 | **No accessible name for the portrait** and no text alternative for the stats. The section is a `div` soup with `aria-hidden` on all imagery and the SVG. | Imagery stays decorative (`aria-hidden`); title/description in `index.html` carry the meaning. The stats remain visually-only. |
| D-14 | S3 | Nav items are `<button>`s that do nothing, and the CTA is a `<button>` with no handler. | Left as-is (no routes in scope), but they type-check as interactive affordances that don't afford. |

---

## 7. Decisions the prompt does not make

These are the gaps that make two builds of the same spec look different. Each is resolved in code,
and each is a one-line change if the intent was different:

1. **Asset hosting.** Both images are proxied through `images.higgs.ai`. Mirroring them into
   `/public` (`hero-base.webp` 81 KB, `hero-reveal.webp` 72 KB) removes a third-party dependency
   from every paint and keeps `/hero-base.webp` preloaded. Original URLs are preserved in a comment.
2. **Scrim geometry/strength** — D-07. Bottom-left radial, so the top-right of the frame keeps its
   full red saturation.
3. **Chest branding placement** — the "Shivnaresh" mark. Both frames share identical framing (head
   top ≈ 6 % / 4 %, collar ≈ 62 % / 60 %, shoulder line ≈ 78 %), so one percentage-based anchor
   works on both portraits: **wearer's left chest = viewer's right, ~57.5 % / 70 %** of the hero
   box. It sits at z-40 — above the reveal, so the badge does not flicker in and out of the
   spotlight — sized in `clamp()` against viewport width so it tracks the torso instead of
   detaching on small screens, with a soft `drop-shadow` so white type survives both the matte
   jacket and the glowing armour seams. `rotate(-1.4deg)` matches the shoulder angle.
4. **Focus states.** All interactive elements get `focus-visible` rings; the spec only defines
   hover. Default rings are invisible on black pills.
5. **Tailwind v3** rather than v4, per §2.

---

## 8. What I would change if the brief were open

1. Replace the canvas mask with gradient masks (§4) — same look, ~0 ms/frame.
2. Move the stat readouts out of the `aria-hidden` SVG into real DOM text, positioned on the same
   polar coordinates, so the numbers are selectable and screen-readable.
3. Give the hero a real second beat: after the intro, the spotlight could idle-drift toward the
   subject's face, which teaches the interaction without a tooltip.
4. Fix the two arc tails (viewBox height 760) and the `USE FORMS` right margin before any copy
   swap.

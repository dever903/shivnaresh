# Shiv-Naresh AI Studio — Full Design & UX Audit (Phase 0)

**Audited:** 2026-11-28  
**Target:** Shiv-Naresh AI Studio (`http://localhost:5173`) — Custom sportswear AI try-on, color swap, video & catalog SaaS  
**Target Audience:** Sportswear brands, merchandisers, B2B/D2C apparel teams (22–45)  
**Intended Brand Feel:** Athletic editorial / technical luxury  

---

## 1. Tech Stack & Versions (from `package.json`)

- **Framework:** `react` `^18.3.1`, `react-dom` `^18.3.1`, `typescript` `~5.6.3`
- **Build & Dev:** `vite` `^5.4.11`, `@vitejs/plugin-react` `^4.3.4`
- **Styling:** `tailwindcss` `^3.4.17`, `autoprefixer` `^10.4.20`, `postcss` `^8.4.49`
- **Icons & Utilities:** `lucide-react` `^0.469.0`, `qrcode` `^1.5.4`, `jszip` `^3.10.2`
- **Backend / Media:** `express` `^5.3.0`, `mongodb` `^7.7.0`, `@ffmpeg-installer/ffmpeg` `^1.1.0`, `busboy` `^1.6.0`, `resend` `^6.37.0`
- **Testing / Capture:** `playwright` `^1.65.0`

---

## 2. Playwright Capture & DOM Telemetry (`audit/before/`)

Captured 24 full-page screenshots across all 8 public routes (`/`, `/design`, `/remove-logo`, `/pricing`, `/about`, `/contact`, `/terms`, `/login`) at `1440px`, `768px`, and `390px` (`audit/before/<route>-<width>.png`, telemetry in `audit/before/telemetry.json`).  
*(Note: unauthenticated `/design` redirects to `/login`.)*

| Route | 1440px Overflow | 768px Overflow | 390px Overflow | `h1` Font / Size (1440) | Missing `focus-visible` / `focus:` Classes |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/` | No | No | No | `JetBrains Mono` / `60px` | 20 / 28 |
| `/design` (→ `/login`) | No | No | No | `JetBrains Mono` / `24px` | 9 / 11 |
| `/remove-logo` | No | No | **Yes (`462px > 390px`)** | `JetBrains Mono` / `36px` | 21 / 21 |
| `/pricing` | No | No | No | `JetBrains Mono` / `48px` | 25 / 25 |
| `/about` | No | No | No | `JetBrains Mono` / `36px` | 22 / 22 |
| `/contact` | No | No | No | `JetBrains Mono` / `36px` | 22 / 27 |
| `/terms` | No | No | No | `JetBrains Mono` / `36px` | 20 / 20 |
| `/login` | No | No | No | `JetBrains Mono` / `24px` | 9 / 11 |

---

## 3. Page-by-Page Findings & Interactive Inventory

### `/` — Landing Hero (`src/App.tsx`)
- **Interactive elements:** Desktop `NavBar` pill (Brand link, 7 nav links, `Start design` CTA, `ThemeToggle`), Mobile brand pill (`href="#home"`), Mobile menu toggle button, Mobile drawer links, Hero `Design your kit` CTA, `SiteFooter` links.
- **Weaknesses:**
  - **Mobile drawer dark-mode contrast bug (`src/App.tsx:136`):** Drawer links hardcode `text-gray-800 border-gray-100` even when `theme === 'dark'` (`bg-[#0c1017] text-white`), rendering dark text on a near-black background.
  - **Per-frame PNG encoding (`src/App.tsx:508`):** `Hero` calls `canvas.toDataURL()` on `requestAnimationFrame` while pointer moves or intro runs, encoding a bitmap to base64 PNG every frame for `mask-image`.
  - **Scan-line artifact on mobile (`home-390.png`):** `.scan-line` leaves a harsh bright white horizontal bar across the subject's forehead during its 4.4s sweep.
  - **Mobile brand link (`src/App.tsx:111`):** Uses `href="#home"` instead of `href="/"` like desktop.

### `/design` — Virtual Try-On Studio (`src/pages/Design.tsx`, 16,278 lines)
- **Interactive elements:** Sticky header (`ThemeToggle`, Quota pill, Credit/Upgrade pill, Profile modal button, Pricing link, Sign out button), `visibleStudioTabs` sub-nav buttons, `MODES` selector pills, `Render Quality` (`1K` / `2K Ultra HD`) segmented toggle, `Option A` / `Option B` Vector Branding cards, garment uploaders, model selector cards, generate CTA, modals (`UserProfileModal`, Quota Popup, Zoom/Crop).
- **Weaknesses:**
  - **Monolithic 16,278-line file** mixing state, API polling, canvas compositing, and JSX.
  - **Emoji & `animate-pulse` clutter:** `📸`, `🎬`, `✨`, `👕`, `⚠️` in primary controls and `animate-pulse` on unread badges (`11428`) and mandatory option badge (`11890`).
  - **Flat card interactions:** `Option A` / `Option B` cards and model cards lack tactile hover elevation or keyboard focus rings.

### `/remove-logo` — Video Watermark Remover (`src/pages/RemoveLogo.tsx`, 1,120 lines)
- **Interactive elements:** Header (`Home` / `Studio` / `Pricing` links, `ThemeToggle`), drag-and-drop upload zone, preset position buttons, `Box Size` (`Tight` / `Standard` / `Wide`) segmented control, `Target Box` visibility toggle, interactive video click overlay, CRF range slider, Play/Pause & seek bar, `Cancel Processing` / `Download` buttons.
- **Weaknesses:**
  - **Mobile horizontal overflow (`remove-logo-390.png`, `462px` vs `390px`):** Top header collides `SHIV-NARESH` with `LOGO REMOVER` badge and pushes `← Home` off-screen.
  - **Invisible brand mark in light mode (`remove-logo-1440.png`):** Uses white `/brand-mark-white.png` on a white `bg-white/80` header without `invert` or dark asset.
  - **Emoji-heavy controls & `animate-pulse` (`843`):** Preset buttons use `⭐`, `✨`, `📐`, `↙️`, `↗️`, `⚙️`; target box pulses continuously.
  - **Zero `focus-visible` classes (`21/21` missing).**

### `/pricing` — Plans & UPI Checkout (`src/pages/Pricing.tsx`, 1,651 lines)
- **Interactive elements:** Header (`ThemeToggle` text button `'Dark'`/`'Light'`, `Open Studio` CTA), 4 Plan cards, `View More Features` accordion toggles, `Pay ₹...` / `Start Free Forever` CTAs, UPI Checkout Modal (QR mode tabs, Copy UPI button, UTR input, Submit, Print Invoice).
- **Weaknesses:**
  - **Uneven card internal alignment (`pricing-1440.png`):** Spec boxes vary from ~95px to ~175px tall due to wrapping copy, misaligning `View More Features` buttons across the 4-column grid.
  - **Light mode surface (`#97c1a9`):** Sage green background clashes with crisp white/red/emerald cards; accordion divider (`1015`) hardcodes `border-white/10` in light mode; `1040` uses `dark:text-emerald-400` without Tailwind `dark:` strategy parity.
  - **Copy & quota contradictions:** `890`/`904` state `1 Photoshoot = 6 poses`, while `Terms.tsx:99` and `Pricing.tsx:304` state `5 poses`; `1144` states `100 on Ultra` credits (lower than `500 on Pro`); `1089` has `"by our our studio team"`.
  - **Zero `focus-visible` classes (`25/25` missing).**

### `/about` — Developer & Studio (`src/pages/About.tsx`, 238 lines)
- **Interactive elements:** Header (`ThemeToggle`, `Enter Studio`), `Direct email` / `Direct phone` links, `Message on WhatsApp` & `Contact desk` buttons, 3 feature cards.
- **Weaknesses:**
  - Personal casual photo in a generic card paired with a 3-column feature grid; lacks editorial typography and subtle card elevation.
  - Header drops all site navigation links (no Pricing/Contact/Terms/About links).

### `/contact` — Support & WhatsApp Form (`src/pages/Contact.tsx`, 299 lines)
- **Interactive elements:** Header (`ThemeToggle`, `View plans`), `Open WhatsApp chat`, `tel:` / `mailto:` links, 5 form fields (`name`, `email`, `phone`, `subject` select, `message` textarea), `Send message via WhatsApp` submit button.
- **Weaknesses:**
  - Form inputs have `focus:outline-none` without `focus-visible:ring-2` (`22/27` interactive elements lack focus rings).
  - Light mode pairs `#97c1a9` page bg with `bg-amber-100` notice card and `bg-[#f9fafb]` info cards, creating fragmented surface contrast.

### `/terms` — Terms of Service (`src/pages/Terms.tsx`, 204 lines)
- **Interactive elements:** Header (`ThemeToggle`, `View Plans`), `Contact Support` & `Chat on WhatsApp` CTAs, `SiteFooter` links.
- **Weaknesses:**
  - **Severe light-mode contrast failure (`terms-1440.png`):** `1. Third-Party Neural Computing` uses `text-emerald-400` directly on `#97c1a9`; `7. Client Verification` uses `text-amber-500` on translucent `bg-amber-500/5` over `#97c1a9`; `Strict no-refund policy` uses `text-red-500` on `bg-red-500/10` over `#97c1a9`.
  - **Zero `focus-visible` classes (`20/20` missing).**

### `/login` — Sign In / Sign Up / OTP (`src/pages/Login.tsx`, 817 lines)
- **Interactive elements:** `ThemeToggle`, `Back to home` link, `Sign in / Create account` segmented toggle, email/password/name/phone inputs, `Show/Hide password` eye button, `Forgot password?` button, `Sign in` submit, `Continue with Google` link, Forgot Password 3-step modal.
- **Weaknesses:**
  - **Low-contrast green-on-green light mode (`login-1440.png`):** `#82b095/40` inputs inside `#8db89f/95` card on `#97c1a9` background; `#e5373f` `Forgot password?` and `text-gray-500` legal copy on sage green fail comfortable readability.
  - `9/11` interactive elements lack `focus-visible` rings.

### `/admin` — Enterprise Admin (`src/pages/Admin.tsx`, 8,292 lines)
- **Interactive elements:** Sticky header (`ThemeToggle`, `Studio ->`, Fashn.ai refresh, `Refresh Live`, `Sign out`), 10-tab sub-nav bar, problem alert banner (`animate-bounce`), data tables, modals, model drag-and-drop.
- **Weaknesses:**
  - `animate-bounce` on alert icon (`2100`), `↻ Refresh Live` text symbol (`1985`), and 8,292-line monolith with inconsistent light-mode sage-green surfaces (`#97c1a9`, `#8db89f`, `#78a48b`).

### `SiteFooter` (`src/components/SiteFooter.tsx`, 147 lines)
- **Weaknesses:** Light mode uses `bg-gray-50` while parent pages use `#97c1a9`, creating a harsh horizontal seam; `Admin Access` link is `opacity-40` (`text-[11px]`).

---

## 4. Top 10 Problems Ranked by Impact on Perceived Quality

1. **Forced Monospace Font Everywhere (`src/index.css:18-24`):** `* { font-family: 'JetBrains Mono', monospace; }` overrides `font-sans` across Pricing, Terms, Contact, Login, and Admin, making marketing and SaaS tables read like raw code.
2. **Broken Light-Mode Palette & Contrast Failures (`#97c1a9` sage green):** Causes unreadable `text-emerald-400` / `text-amber-500` / `text-red-500` on `/terms`, green-on-green inputs on `/login`, and stark white footer seams.
3. **Mobile Horizontal Overflow & Header Collision on `/remove-logo` (`390px`):** `scrollWidth: 462 > 390` clips `← Home` off-screen and overlaps `SHIV-NARESH` with `LOGO REMOVER`.
4. **Invisible White Brand Mark in Light Mode (`/remove-logo`):** `/brand-mark-white.png` rendered on `bg-white/80` without `invert` or dark logo.
5. **Systemic Missing Keyboard Focus States:** 138+ interactive elements across public pages lack `focus-visible` rings (`25/25` on `/pricing`, `21/21` on `/remove-logo`, `20/20` on `/terms`).
6. **Fragmented Navigation & Header Identity:** `/` uses a floating pill with 7 links and panther mark, while `/pricing`, `/about`, `/contact`, `/terms` use a red `SN` box with no nav links, and `/pricing` uses text `'Dark'/'Light'` instead of an icon toggle.
7. **Mobile Nav Drawer Dark-Mode Bug (`src/App.tsx:136`):** Hardcoded `text-gray-800` inside `bg-[#0c1017]` dark drawer makes links unreadable.
8. **Pricing Card Height Mismatch & Quota Copy Contradictions:** Uneven spec boxes misalign CTAs; `6 poses` vs `5 poses` and `100 Ultra credits` vs `500 Pro credits` erode B2B trust.
9. **AI Slop / Dated Tells (`animate-pulse`, `animate-bounce`, Emoji Labels):** Continuous pulsing badges/boxes and emojis (`📸`, `🎬`, `⭐`, `✨`, `⏱️`) cheapen the technical luxury positioning.
10. **Flat Static Surfaces & Expensive Hero Canvas Loop:** Cards/tabs lack refined hover/press micro-interactions (`.card-lift-glow` is unused), while `Hero` encodes `canvas.toDataURL()` on every frame.

---

## 5. What "Premium" Is Missing

To hit **athletic editorial / technical luxury** for B2B sportswear teams:
- **Typographic Pairing:** Reserve `JetBrains Mono` for telemetry, specs, UTR/invoice codes, and technical labels; use a crisp grotesk/sans (`Inter` / `Plus Jakarta Sans` / system editorial sans) for headlines, body copy, and pricing tables.
- **Disciplined Surface Hierarchy:** Replace `#97c1a9` light mode with crisp chalk/alabaster (`#F7F8FA`) + pure white elevated cards (`#FFFFFF`) + hairline `rgba(15,23,42,0.08)` borders; keep dark mode deep obsidian (`#070709`) with `#101116` cards.
- **Unified Navigation Chrome:** Share one consistent header brand mark + route links across all public pages.
- **Surgical, Purposeful Motion:** One intentional interaction per element (lift-and-glow on pricing cards, sliding tab/nav indicators, smooth accordions, cursor spotlight on hero) with zero idle `animate-pulse`/`animate-bounce` noise and full `prefers-reduced-motion` + keyboard fallbacks.

---
name: notai
description: "Eliminates all AI design slop and generic AI frontend patterns. Integrates AntiSlopUI and Avoid-AI-Design to produce human-crafted, bespoke, brand-authentic UI without AI tells (no purple gradients, no cookie-cutter 3-card grids, no floating glow blobs, no robotic emoji labels). Use when user runs /notai, asks to make UI look human-designed, or requests authentic design system standards."
---

# /notai - Human-Crafted, Distinctive UI (AntiSlopUI + Avoid-AI-Design)

When `/notai` is invoked or when designing, refining, or auditing any frontend UI, follow this dual-layer anti-slop system:

## 1. Zero AI Tells (First & Second-Order Ban List)

### ❌ First-Order Tells (The "Vibecoded" AI Look)
- **Colors**: Indigo/violet `#6366f1` / `#8b5cf6` gradients, dark mode with neon purple/cyan glowing blobs (`backdrop-blur-md` on glass cards).
- **Typography**: Unstyled generic system sans or pure Inter without character, tracking or deliberate weight contrast.
- **Layout**: Centered hero with generic badge `"✨ AI-Powered Platform"`, followed by exactly 3 cards in a horizontal grid.
- **Icons**: Emoji used as feature icons (🚀, ⚡, 💡, 🔥, ✨) instead of purposeful vector icons (Lucide/heroicons).
- **Motion**: `animate-pulse`, `animate-bounce` on static text or buttons for artificial "life".

### ❌ Second-Order Tells (The "Tasteful AI" Look)
- Cream background (`#fdfbf7`) with terracotta/rust accent.
- Near-black (`#0a0a0c`) with acid green or lime yellow highlight.
- Monospace uppercase section headers with tracking-widest (`UPPERCASE MONO LABEL // 01`).
- Heading with exactly ONE word in an accent color or italic serif.
- Faux numbered lists (`01`, `02`, `03`) with thin rules between them.

---

## 2. Positive Architecture (Human Craft Standards)

### 🎨 1. Palette Derived from Brand & Purpose
- Pull real colors from the product's domain (e.g. Shiv-Naresh athletic red `#e52b38`, true Olympic navy, pure carbon black).
- Use intentional high-contrast hierarchy (dominant 60%, supporting 30%, accent 10%).

### 📐 2. Real Information Architecture
- Asymmetric layouts, purposeful dashboards, functional split-panes, compact density for data-dense tools.
- Never use a placeholder 3-column feature grid when the app needs a timeline, an inspector panel, or an interactive canvas.

### ✍️ 3. Concrete, Authentic Copy
- Eliminate corporate AI fluff: `"Transform your workflow"`, `"Next-gen AI solutions"`, `"Supercharge your productivity"`.
- Use specific, direct product language: `"16.7M Fabric Color Tinting"`, `"0°–360° Real-time Garment Rotation"`, `"High-Definition Embroidery Stitch Engine"`.

### 🎛️ 4. Tactile Controls & Micro-Interactions
- Crisp borders (`border-white/10` or `border-slate-200`), tangible drop shadows (`shadow-sm`, `shadow-md`), tactile button press states (`active:scale-[0.98]`).
- Instant visual feedback on hover/focus/active.

---

## 3. Reference Libraries & Tools Included in this Plugin
- **AntiSlopUI Engine**: See `./AntiSlopUI/` for complete positive design patterns (typography, animation, charts, dashboards).
- **Avoid-AI-Design Engine**: See `./avoid-ai-design/` for detection rules and catalogue of 40+ AI tells.
- **Automated Scanner**: Run `node .agents/skills/notai/avoid-ai-design/scripts/detect.mjs <file>` to automatically scan code for AI design tells.

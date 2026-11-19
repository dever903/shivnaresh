# Multi-Image Video Generation & Fixed Credit Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable users to upload any number of images at once in the Fashion Video Studio, pair them seamlessly with motion prompts, generate 1080p fashion runway videos, and guarantee a fixed credit cost without wasted or duplicate credit deductions.

**Architecture:** Frontend client allows multi-image upload with fast client-side standardization and primary frame selection; backend `/api/generate-video` fixes a critical `ReferenceError: modelImage is not defined` bug, accepts `images: string[]`, stores all reference poses in generation metadata, and enforces strict fixed billing (6 credits for 5s / 12 credits for 10s) with automatic refund on any failure.

**Tech Stack:** React 18, TypeScript, Tailwind CSS, Vite, Node.js Express, MongoDB, Fashn.ai API.

**Spec:** Brainstormed with user on 2026-11-19.

## Global Constraints
- Fixed credit cost: exactly 6 credits for 5-second video, exactly 12 credits for 10-second video. No credit multipliers for uploading multiple images.
- Zero duplicate billing: client-side submit lock and server user concurrency lock prevent repeated deductions.
- Automatic refund: any GPU rejection or processing failure must 100% refund user credits.
- Non-breaking backwards compatibility: clients sending single `image` or `cloth`/`model` continue working.

## Review Focus
1. Multi-file upload with 1 to 20 files without UI lag or memory spike.
2. Prompt properly incorporates athletic brand details and multi-angle presentation.
3. Server-side `ReferenceError: modelImage is not defined` eliminated completely.
4. User credit balance correctly decrements by fixed amount only once.
5. In case of unexpected server crash or Fashn failure, credits are restored.

---

### Task 1: Fix Server-Side Video Endpoint & Multi-Image Ingestion

**Files:**
- Modify: `server/index.mjs:6312-6515`

**Interfaces:**
- Consumes: `req.body.images` (optional `string[]`), `req.body.image` (optional `string`), `req.body.prompt`, `req.body.duration`, `req.body.aspect_ratio`
- Produces: JSON response `{ ok: true, id, duration, aspect_ratio, credits, creditsUsed, videosGenerated, maxVideos, status }`

- [ ] **Step 1: Fix `modelImage` bug and parse multi-image payload**
  In `server/index.mjs`:
  - Extract `images`: if `Array.isArray(body.images)` and has items, use `body.images`; else if `body.image` or `body.cloth` or `body.model`, wrap in array `[body.image || body.cloth || body.model]`.
  - Primary image for Fashn API: `const primaryImage = images[0];`
  - Convert `primaryImage` to data URI via `await toDataUri(primaryImage)`.
  - Fix line 6496: replace `model: modelImage || ''` with `model: primaryImage || ''` and add `images: images.slice(0, 10)` to the generation record.

- [ ] **Step 2: Connect multi-image context into runway motion prompt**
  In `server/index.mjs`:
  - If `images.length > 1`, augment prompt to instruct the motion model to showcase full multi-angle apparel dynamics and transitions.

- [ ] **Step 3: Enforce fixed billing and fail-safe credit refund**
  In `server/index.mjs`:
  - Ensure `creditsNeeded` is strictly `duration === 10 ? 12 : 6` regardless of image count.
  - Wrap database generation insert in try/catch; if any unexpected error occurs after credits were patched, automatically refund `creditsNeeded` back to the user before returning 500 error.

---

### Task 2: Update API Client Signatures

**Files:**
- Modify: `src/lib/api.ts:684-700`

**Interfaces:**
- Consumes: `api.generateVideo` calls in `Design.tsx`
- Produces: Typed parameter `{ image?: string; images?: string[]; prompt?: string; duration?: 5 | 10; aspect_ratio?: string }`

- [ ] **Step 1: Update TypeScript definition for `generateVideo`**
  In `src/lib/api.ts`:
  - Add `images?: string[]` to the input body type for `generateVideo`.

---

### Task 3: Fashion Video Studio Multi-Image Upload & UI

**Files:**
- Modify: `src/pages/Design.tsx:4650-5250`

**Interfaces:**
- Consumes: `prepareAndStandardizeImage`, `api.generateVideo`
- Produces: Multi-image interactive selector with thumbnail strip, primary frame indicator, smart motion prompts, fixed credit badge, and submit lock.

- [ ] **Step 1: Add multi-image state and batch file loader**
  In `src/pages/Design.tsx` (`RunwayVideoStudio` component):
  - State: `const [videoImages, setVideoImages] = useState<string[]>([]);`
  - State: `const [primaryImgIdx, setPrimaryImgIdx] = useState<number>(0);`
  - State: `const [uploadingFiles, setUploadingFiles] = useState<boolean>(false);`
  - Handler `handleMultipleVideoFiles(files: FileList | File[])`:
    - Loop through files, call `prepareAndStandardizeImage(file, 'model')` to compress to ~150KB JPEG.
    - Append new data URLs to `videoImages`. If `videoImages` was empty, default `primaryImgIdx` to 0.

- [ ] **Step 2: Multi-Image interactive upload & thumbnail gallery UI**
  In `src/pages/Design.tsx`:
  - Update file input to `multiple`: `<input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp" onChange={(e) => void handleMultipleVideoFiles(e.target.files)} ... />`
  - Add drag-and-drop handler on upload area accepting multiple dropped images.
  - Render an interactive thumbnail gallery below/inside the upload card:
    - Displays all uploaded images as cards with thumbnail, angle index, "★ Primary" badge, "Make Primary" button, and "✕" remove button.
    - "+ Add more angles" button to append more images at any time.

- [ ] **Step 3: Prompt integration and motion prompt presets**
  In `src/pages/Design.tsx`:
  - Connect `videoPrompt` with dynamic quick-insert prompt pills (e.g. "Runway Walk", "Dynamic Sprint", "360° Studio Spin", "Camera Zoom on Logo").
  - Clear guidance explaining that all uploaded angles are provided as athletic reference.

- [ ] **Step 4: Credit display and submit deduplication lock**
  In `src/pages/Design.tsx`:
  - Display fixed cost badge: `Fixed Cost: 6 credits (5s) / 12 credits (10s) — Upload any number of images at no extra charge`.
  - In `runActualVideoGeneration`:
    - Send `images: videoImages` and `image: videoImages[primaryImgIdx] || videoImages[0]`.
    - Double-click submit lock: ensure button is disabled and submit cannot be re-triggered while in flight.

---

### Task 4: Build Verification & Deployment

**Files:**
- Verify: Full codebase

- [ ] **Step 1: Execute `npm run build`**
  - Verify `tsc --noEmit` exits with 0 errors.
  - Verify `vite build` packages clean assets.

- [ ] **Step 2: Commit and push to `origin main`**
  - Git commit with descriptive message.
  - Push to `main` to trigger automated Render deployment.

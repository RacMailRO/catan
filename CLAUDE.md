# Project Rules & Development Guidelines — Catan V2

These rules govern all feature development, bug fixes, refactoring, and AI-assisted workflows in this codebase. Follow these rules consistently to prevent regressions.

---

## 1. UI & Theming: Tailwind CSS First

The application UI is built with **Tailwind CSS** and a tokenized design system.

### Design Tokens & Themes
Themes are configured in `apps/web/src/styles/tokens.css` and extended in `apps/web/tailwind.config.js`. Three themes are supported via `:root[data-theme="..."]`:
- `dark` (Default) — Classic Catan navy, gold, parchment theme (defined directly on `:root` and `<html data-theme="dark">`)
- `light` — Modern clean light theme with full light styling for `.app-header` (white), panels, lobby cards, and high-contrast hamburger menu
- `xmas` — Festive evergreen & warm gold theme

---

## 2. Resource Terminology Standard (RO & EN)

The game's resource names are strictly standardized and centralized in `apps/web/src/i18n.ts` (`RESOURCE_LABELS`):
- **`wood`**: `Lemn` (RO) / `Wood` (EN) — Icon: 🌲
- **`brick`**: `Cărămidă` (RO) / `Brick` (EN) — Icon: 🧱
- **`sheep`**: `Oaie` (RO) / `Sheep` (EN) — Icon: 🐑 (⚠️ **NEVER** use `Lână` anywhere in UI, dialogs, rules, or bot engine)
- **`wheat`**: `Grâu` (RO) / `Wheat` (EN) — Icon: 🌾
- **`ore`**: `Piatră` (RO) / `Ore` (EN) — Icon: ⛰️ (⚠️ **NEVER** use `Minereu` anywhere in UI, dialogs, rules, or bot engine)
- **Terrains**: `Pădure (Lemn)`, `Deal (Cărămidă)`, `Pășune (Oaie)`, `Câmp (Grâu)`, `Munte (Piatră)`

> **RULE**: Never hardcode Romanian resource names in components. Always consume `RESOURCE_LABELS[locale][resource]` to guarantee 100% uniformity across player hand, trade builders, bank, notifications, logs, and rules.

---

## 3. Reusable Component Standard (DRY)

> **RULE**: Every UI modification must be implemented as a reusable component or utility so changes propagate everywhere automatically. Never duplicate inline styles or markup for shared patterns.

### Available Core Components:
- **Game Cards**: `ResourceCardSprite`, `DevCardSprite`, `CostCardThumb` (`apps/web/src/components/GameAssets.tsx`)
- **Card Badges**: `CardBadge` (`apps/web/src/components/GameAssets.tsx`)
- **Resource Icons & Costs**: `ResourceIcon`, `ResourceCostBadge`, `CostItemRow` (`CostsHelp.tsx`, `GameAssets.tsx`)
- **Surfaces & Drawers**: `AdaptiveSurface` (`apps/web/src/components/ui/AdaptiveSurface.tsx`)
- **Blocking Modals**: `Dialog` (`apps/web/src/components/ui/Dialog.tsx`)
- **Navigation & Shell**: `AppNav`, `ThemeToggle`

---

## 3. Card UI & Count Badge Standard

Every game card in the application (player hand dock, bank stock, dev cards, trade builders, dialogs) MUST adhere to these strict rules:

### Badge Position: ALWAYS Top-Right Corner
- **Placement**: Number badge is positioned in the **top-right corner** (`top: -6px; right: -6px;`).
- **Never Centered or Below**: Badges must NEVER be positioned below the card or centered at the bottom.
- **Badge States**:
  - `count === 0`: Dark, muted background (`rgba(8, 16, 24, 0.92)` / `border-line`), muted text.
  - `count > 0`: Gold accent background (`var(--accent-gold)`), dark text, parchment border (`.has-items`).
- **Badge Content**: Renders only the plain number `{count}` (e.g., `0`, `1`, `19`). Do not prefix with `x` (e.g. use `0` not `x0`).

### Cards Drawer (Hand Dock) Consistency
In the player's bottom hand drawer (`.dock-cards-row`):
- All 7 cards (5 resource cards, 1 dev card back, 1 cost table shortcut) must have:
  - Identical dimensions (`38px` width × `56px` height for `xs`).
  - Identical borders (`2px solid var(--parchment)`), border radius, and box shadow.
  - Identical bottom label styling (`.sprite-card-label.sprite-card-label-xs`).
  - Identical top baseline alignment (`align-items: start` / `align-items: stretch`).
  - NO arbitrary `marginBottom` differences.
  - The last 2 cards must NEVER be displaced vertically or sit lower than the other cards.
- **Score & Bank vs Dock**: The player's full cards are permanent in the bottom dock. In modals/surfaces like `ScoreBank`, display compact summaries (`🎴 X resurse · 🃏 Y dezvoltare`) so all player cards remain uniform and fit without vertical scrolling.

### In-Game Top HUD Layout & Controls
In `.board-top-banner`:
- Row 1: Full-width turn status (`.header-turn-status`).
- Row 2 (`.board-top-controls`): Balanced single-row layout:
  - Left: `[👥 Scor & Bancă]` button.
  - Center: `AnimatedDiceWidget` (dice faces on top, roll outcome/status text displayed underneath).
  - Right: `[📜 Jurnal (N)]` button and timer badge.
- In Lobby: In-progress matches show the action button label **"👁️ Urmărește partida"** (RO) / **"👁️ Watch Game"** (EN).

---

## 4. Modals & Surfaces Standard

### Z-Index Layering & Header Clearance
- **`.app-header`**: `z-index: 100` (height 52px).
- **`AdaptiveSurface`**: `z-[150]` — MUST render above `.app-header` so its title and close button are never cut off or overlapped by header icons (`[ EN ]`, `[ ⛶ ]`).
- **`Dialog`**: `z-[160]` — Stacks above both `AdaptiveSurface` and `.app-header`.

### Content Drawers & Sheets (`AdaptiveSurface`)
- Use `AdaptiveSurface` for slide-over drawers on desktop (>960px) and bottom sheets on mobile (<=960px).
- **Header as Close Trigger**: The entire header bar is clickable (`onClick={onClose}`) with `cursor-pointer` and hover feedback.
- **Visible Close Button**: The close button must be high-contrast, tactile, and prominent (`w-8 h-8 rounded-full border border-line bg-surfaceMuted font-bold`).
- **Accessibility**: Always keep `aria-label="Close"` on the close button.
- **Non-Scrollable Panels**: When displaying fixed reference tables (such as `CostsHelp`), pass `scrollable={false}` to avoid vertical scrollbars.

### Building Costs Reference (`CostsHelp`)
- **Single-Row Resources**: All required resource costs for each construction (Drum, Navă, Așezare, Oraș, Carte de Dezvoltare) MUST fit on **one single horizontal row** (`flex-row flex-nowrap`).
- **VP Labels**: Only show victory points for items that grant fixed points: **Așezare** (`1 VP`) and **Oraș** (`2 VP`). Omit VP labels from Drum, Navă, and Carte de Dezvoltare.
- Resource tokens must be compact (`ResourceCostBadge`) so that even 4 resources fit without wrapping or scrolling.

---

## 5. Trade Negotiation & Anti-Stall Standard

To prevent games from ever stalling when an AI or human proposes a trade:
1. **Auto-Refuse when Unaffordable**:
   - If the receiving player does not hold the requested resources (`!canAfford`), the client **must immediately dispatch `respond_trade: reject`** (reason: `Nu am resursa cerută`).
   - Display a non-blocking toast banner informing the user: *„📢 [Player] requested [X]. Auto-declined (insufficient resources).”*
   - Never wait on an unaffordable player; the game proceeds without stalling.
2. **30-Second Animated Timer for Affordable Trades**:
   - If the player holds the resources, display the `IncomingTradeOfferModal` with an animated countdown progress bar (`30s` down to `0s`).
3. **Accidental Click Protection**:
   - The modal must set `disableBackdropClick={true}`. Clicking on the board, background, or Escape will NOT close the modal.
4. **Auto-Refuse on Timeout**:
   - If 30 seconds elapse without the player choosing Accept, Reject, or Counter-Offer, the modal automatically dispatches `respond_trade: reject` with reason `Timp expirat (30s)` and closes.
5. **Server Stale Trade Cleanup**:
   - The server calls `expireStaleTradesInPlace(runtime.state)` at the start of bot execution loops to automatically prune expired trades.

---

## 6. Architecture & Monorepo Structure

- **`packages/core`**:
  - 100% pure TypeScript game engine, zero DOM, zero network dependencies.
  - Deterministic state machine (`catanEngine`), seedable PRNG (`MersenneTwister`), full replay engine.
- **`packages/ai`**:
  - Heuristic evaluators, Monte Carlo rollout simulator, multi-difficulty bots, optional LLM strategic advisor.
- **`packages/protocol`**:
  - Zod schemas, action validators, WebSocket message contracts.
- **`apps/server`**:
  - Fastify + WebSocket server, SQLite persistence (`catan-local.sqlite`).
  - Bundled with esbuild into a single standalone file `apps/server/dist/server.mjs`.
  - Serves static frontend assets from `apps/server/dist/public`.
- **`apps/web`**:
  - React 18, Vite, Tailwind CSS, SVG board rendering (`BoardSvg.tsx`), responsive adaptive UI.

---

## 7. Remote Server & Deployment Standard

The live production server is hosted at **`https://catan.d10.ro`** on cPanel with Phusion Passenger (Node.js).

### Deployment Workflows:
1. **Automated CI/CD via GitHub Actions (Primary)**:
   - Workflow file: `.github/workflows/deploy.yml`
   - Triggers on `push` to `main` branch or manual `workflow_dispatch`.
   - Setup: Node.js 22 (required for native `node:sqlite`).
   - Runs `npm ci`, `npm test` (with 60s timeout for AI simulations), and `npm run build`.
   - Stages files into `.deploy/` with dual-structure mirroring:
     - `apps/server/dist/*` and `apps/server/server-entry.mjs` (matching cPanel's Passenger startup file `apps/server/server-entry.mjs`).
     - Root `dist/*` and `server-entry.mjs` (for root-scoped fallback).
     - `tmp/restart.txt` and `apps/server/tmp/restart.txt` (triggers Passenger worker restart).
   - Protocol: Enforces **`protocol: ftps`** with `security: loose` to satisfy Pure-FTPd's TLS requirement.
   - Verifies live deployment by curling `https://catan.d10.ro/api/version`.
2. **Manual FTP Deployment (Fallback)**:
   - Build locally via `npm run build`.
   - Upload `apps/server/server-entry.mjs` and `apps/server/dist/` to server app root.
   - Touch `tmp/restart.txt` or click Restart in cPanel.
3. **CRITICAL — Database Safety**:
   - **NEVER** upload `catan-local.sqlite` to the server. The live database contains real matches and high scores.
4. **Verification**:
   ```bash
   curl -s https://catan.d10.ro/api/version
   ```

---

## 8. Verification & Quality Assurance

Before committing or pushing any change:
1. Run `npm test` — all test suites must pass (engine, replay, AI, web components, UI showcase).
2. Run `npm run build` — both web (Vite) and server (esbuild) must compile with zero errors.

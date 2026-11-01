# Project Rules & Development Guidelines — Catan V2

These rules govern all feature development, bug fixes, refactoring, and AI-assisted workflows in this codebase. Follow these rules consistently to prevent regressions.

---

## 1. UI & Theming: Tailwind CSS First

The application UI is built with **Tailwind CSS** and a tokenized design system.

### Design Tokens & Themes
Themes are configured in `apps/web/src/styles/tokens.css` and extended in `apps/web/tailwind.config.js`. Three themes are supported via `:root[data-theme="..."]`:
- `dark` (Default) — Classic Catan navy, gold, parchment theme
- `light` — Modern clean light theme
- `xmas` — Festive evergreen & warm gold theme

### Tailwind Token Mapping
Always use semantic Tailwind utility classes mapped to theme tokens:
- **Backgrounds**: `bg-bg`, `bg-surface`, `bg-surfaceMuted` (`--surface-2`)
- **Text**: `text-ink` (high contrast), `text-inkSoft` (secondary / muted)
- **Borders & Dividers**: `border-line`
- **Accents**: `bg-accent`, `text-accentInk`, `border-accent`, `text-amber-500`
- **Warnings & Alerts**: `text-warn`, `bg-warn`

> **RULE**: Do NOT hardcode hex colors (e.g. `#ffffff`, `#192A3A`) for UI chrome, backgrounds, panels, and borders. Use the semantic Tailwind classes so the entire UI adapts cleanly across all 3 themes.

---

## 2. Reusable Component Standard (DRY)

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

### Content Drawers & Sheets (`AdaptiveSurface`)
- Use `AdaptiveSurface` for slide-over drawers on desktop (>960px) and bottom sheets on mobile (<=960px).
- **Header as Close Trigger**: The entire header bar is clickable (`onClick={onClose}`) with `cursor-pointer` and hover feedback.
- **Visible Close Button**: The close button must be high-contrast, tactile, and prominent (`w-8 h-8 rounded-full border border-line bg-surfaceMuted font-bold`).
- **Accessibility**: Always keep `aria-label="Close"` on the close button.
- **Non-Scrollable Panels**: When displaying fixed reference tables (such as `CostsHelp`), pass `scrollable={false}` to avoid vertical scrollbars.

### Building Costs Reference (`CostsHelp`)
- **Single-Row Resources**: All required resource costs for each construction (Drum, Navă, Așezare, Oraș, Carte de Dezvoltare) MUST fit on **one single horizontal row** (`flex-row flex-nowrap`).
- Resource tokens must be compact (`ResourceCostBadge`) so that even 4 resources fit without wrapping or scrolling.

---

## 5. Architecture & Monorepo Structure

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

## 6. Remote Server & Deployment Standard

The live production server is hosted at **`https://catan.d10.ro`** on cPanel with Phusion Passenger (Node.js).

### Deployment Rules:
1. Git repository exists **locally only** (no git or SSH on remote server).
2. All builds are performed locally via:
   ```bash
   npm run build
   ```
3. Upload via FTP to application root:
   - `apps/server/server-entry.mjs` → `server-entry.mjs`
   - `apps/server/dist/` → `dist/` (includes bundled `server.mjs`, `version.json`, and static `public/`)
4. **CRITICAL — Database Safety**:
   - **NEVER** upload `catan-local.sqlite` to the server. The live database contains real matches and high scores.
5. **Restart**:
   - In cPanel → **Setup Node.js App** → Select Application → **Restart**.
6. **Verify**:
   ```bash
   curl -s https://catan.d10.ro/api/version
   ```

---

## 7. Verification & Quality Assurance

Before committing or pushing any change:
1. Run `npm test` — all test suites must pass (engine, replay, AI, web components, UI showcase).
2. Run `npm run build` — both web (Vite) and server (esbuild) must compile with zero errors.

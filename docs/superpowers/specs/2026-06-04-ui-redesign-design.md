# FortuneCards UI Redesign — Design Spec

**Date:** 2026-06-04
**Status:** Approved

---

## Overview

A full UI redesign of the FortuneCards Angular + ASP.NET Core application. The approach is **Design System + Refactor**: define a small shared design system (tokens, component styles), then refactor each page one at a time to adopt it. Existing business logic (API calls, routing, forms) is untouched.

---

## Visual Direction

**Playful / Whimsical** — vivid gradients, rounded shapes, energetic feel. Approachable and fun, like a creative card game app.

---

## Design System

### Color Palette

| Name      | Hex       | Use                          |
|-----------|-----------|------------------------------|
| Coral     | `#FF6B6B` | Primary actions, accents     |
| Sunny     | `#FECA57` | Gradients, highlights        |
| Sky       | `#48DBFB` | Cool accents, gradients      |
| Blush     | `#FF9FF3` | Soft accents, gradients      |
| Lavender  | `#A29BFE` | Cool accents, gradients      |
| Cream     | `#FFF9F0` | Page background              |
| Charcoal  | `#2C2C2C` | Body text, headings          |

Each deck tile uses a gradient chosen by the user at creation time, stored as a `ColorIndex` (0–4) on the deck. The 5 gradients: Coral→Sunny, Sky→Blush, Lavender→Sky, Blush→Sunny, Sunny→Coral.

### Typography

**Font:** [Nunito](https://fonts.google.com/specimen/Nunito) (Google Fonts) — rounded, warm, readable.

| Role           | Size  | Weight |
|----------------|-------|--------|
| Page title     | 28px  | 800    |
| Section heading| 18px  | 700    |
| Body           | 14px  | 400    |
| Label / caps   | 12px  | 600    |
| Card title     | 15px  | 800    |
| Micro label    | 9–11px| 700    |

### Spacing & Shape

- **Border radius:** 12px (inputs), 16px (cards/tiles), 20px (large cards), 100px (buttons/pills)
- **Background:** Cream (`#FFF9F0`)
- **Card shadow:** `0 3px 12px rgba(0,0,0,0.09)`
- **Button shadow:** `0 4px 14px <color>44` (color-tinted)

### Core Components

**Primary button:** Coral→Sunny gradient, pill shape, white bold text, color-tinted shadow.

**Secondary button:** White background, Coral border and text, pill shape.

**Input field:** White background, `#e0d5cc` border (2px), 12px radius. Focus state: Coral border.

**Deck tile:** Square aspect ratio, gradient background, rounded-20px, emoji + name + card count in white bold text, colored shadow.

**Card (tarot):** `aspect-ratio: 2/3` (portrait), white background, rounded-12–16px, image fill area on top, accent color top-border + title strip at bottom.

**Nav bar:** White background, `#f0e8dc` bottom border, Nunito 800 for logo/title.

---

## Pages

### 1. Deck List (Home)

**Layout:** Cream background. Top nav bar with app name ("🎴 FortuneCards") and "New Deck" primary button. Below: page title "My Decks ✨" with deck count subtitle. Content: responsive grid of deck tiles.

**Responsive grid:**
- Mobile: 2 columns
- Desktop: 4 columns

Each tile: gradient background (one of 5 cycling gradients), emoji, deck name (bold white), card count (soft white). Last tile is a dashed "+" placeholder to create a new deck.

---

### 2. Deck Detail

**Layout:** Top nav bar with breadcrumb ("← My Decks / Deck Name") and two action buttons: "+ Add Card" (secondary) and "🎴 Draw a Card" (primary).

**Hero banner:** Full-width gradient strip (deck's assigned gradient) with large emoji and deck name + description + card count in white.

**Cards grid:** Below the hero. Label "Cards in this deck". Responsive grid of tarot-proportioned cards:
- Mobile: 3 columns
- Desktop: 6 columns

Each card: white background, soft gradient tint in image area (cycling accent color at ~10% opacity), emoji/image centered, accent-colored top border (3px), card title in bold below. Last slot is a dashed "+" placeholder.

---

### 3. Card Draw (Flip Reveal)

**Layout:** Centered single-column. Top nav with "← Deck Name" back link and "Draw a Card" title.

**States:**

1. **Face-down:** Tarot-proportioned card (220×330px). If the deck has a card back image, it fills the card back as a cover image. If not, the back shows the deck's color gradient with a decorative inner border and 🎴 emoji. Either way, "Tap to reveal" label is shown at the bottom. Card pulses gently (scale + shadow animation) to invite interaction. Hint text above: "✨ Tap the card to reveal your fortune."

2. **Flip animation:** On tap/click, 3D CSS `rotateY(180deg)` flip, 0.7s cubic-bezier easing. Hint text fades out.

3. **Revealed:** Card face shows uploaded image (or emoji placeholder) in the image area, Coral top-border accent, card title (bold, 15px), and description text (11px, muted). Two action buttons fade in below: "🎴 Draw Another" (primary) and "← Back to Deck" (secondary).

---

### 4. Create Deck Form

**Layout:** Modal-style full screen on mobile, centered card on desktop. Top bar with "✕ Cancel" (left), "New Deck" title (center), and greyed "Create" (right, activates when valid).

**Fields:**
1. **Emoji picker** — large circular gradient preview tile, tap to change emoji. Centered at top.
2. **Color** — row of 5 gradient swatches (one per deck gradient). Selected swatch has a ring indicator.
3. **Card back image** — tarot-proportioned (2:3) upload area, optional. Label: "Card Back (optional)". Placeholder shows the selected color gradient as a live preview with a camera icon and "Upload a custom card back" hint. When an image is uploaded it replaces the gradient preview. This image is shown on the face-down side of every card in the deck during the flip reveal.
4. **Deck Name** — text input, required, max 200 chars.
5. **Description** — textarea, optional, max 1000 chars.

**Submit:** "✨ Create Deck" primary button, full width.

---

### 5. Add Card Form

**Layout:** Same modal-style shell as Create Deck.

**Fields:**
1. **Card image** — tarot-proportioned (2:3) upload area, dashed border, "Tap to upload card image" placeholder, "+ Upload" label. Shows image preview once selected.
2. **Card Title** — text input, required, max 200 chars.
3. **Meaning / Description** — textarea, required, max 2000 chars.

**Submit:** "🎴 Add Card" primary button, full width.

---

## Responsive Behavior

- **Breakpoint:** 768px (tablet/desktop threshold)
- Mobile-first CSS; desktop adjustments via `@media (min-width: 768px)`
- Nav bar collapses title on very small screens; buttons remain accessible
- Forms are full-screen sheets on mobile, centered max-width cards on desktop
- Font sizes, spacing, and grid columns scale appropriately (see per-page notes above)

---

## Implementation Approach

**Design system file:** `fortunecards.client/src/styles/design-system.scss` — CSS custom properties (tokens) for colors, spacing, radii, shadows, and typography scale. All components import from this file.

**Font loading:** Nunito loaded via `<link>` in `index.html` from Google Fonts.

**Flip animation:** Pure CSS `transform: rotateY()` + `perspective` + `backface-visibility: hidden`. Triggered by Angular class binding.

**Deck color assignment:** User-chosen via the color swatch in the Create Deck form. Stored as `ColorIndex` (0–4) on the `Deck` model. The 5 gradients cycle: 0=Coral→Sunny, 1=Sky→Blush, 2=Lavender→Sky, 3=Blush→Sunny, 4=Sunny→Coral.

**Emoji:** User-chosen via a native emoji text input (single character) in the Create Deck form. Stored as `Emoji` (string, max 10) on the `Deck` model. Default: `🎴`.

**Backend changes required (small):**
- Add `Emoji` (string, max 10, nullable, default `"🎴"`) to `Deck` model and EF migration.
- Add `ColorIndex` (int, 0–4, default 0) to `Deck` model and EF migration.
- Add `CardBackImageUrl` (string, nullable) to `Deck` model and EF migration. Stored the same way as card images (`wwwroot/images/`).
- Update `DeckSummary` and `DeckDetail` DTOs to include all three new fields.
- Update `DecksController` POST to accept and persist emoji, color index, and optional card back image upload.

**Pages to refactor (in order):**
1. `DeckListComponent` — grid layout, tile styles
2. `DeckDetailComponent` — hero banner, tarot card grid
3. `DrawnCardComponent` — flip animation, reveal state
4. `CreateDeckComponent` — emoji input, color swatch, form styles
5. `CreateCardComponent` — tarot upload area, form styles

---

## Out of Scope

- User authentication
- Deck/card editing (update)
- Search or filtering
- Animations beyond the card flip
- Custom emoji upload (emoji picker uses a predefined set or native emoji input)

# Fortune-telling process — design

**Branch:** `11_Table` · **Date:** 2026-07-15

## Goal

Guide the user through a fortune-telling reading: the pattern's questions are
asked one at a time, and for each the user picks a card from the deck, which is
dealt face-up onto the matching pattern slot. The text of the answered pattern
question is recorded on the deck card.

## Model change (`models/table.ts`)

- Rename `TableDeckCard.patternId?: string` → `patternText?: string`.
  It holds the combined `"{order}. {text}"` of the pattern card the deck card was
  dealt onto (e.g. `"1. Position 1"`).
- `patternText` is cleared (set to `undefined`) whenever deck cards are (re)placed
  via `placeCards` / `loadDeck`.

## New state (`TableComponent`)

- `fortuneStepOrder = signal<number | null>(null)` — the `order` of the pattern
  card whose question is currently being asked. `null` means the process is not
  running.
- `activePatternId = computed(...)` — id of the pattern card whose
  `order === fortuneStepOrder()`, or `null`.
- `fortuneActive = computed(() => fortuneStepOrder() !== null)`.

## Flow

1. **Start** — a new Pattern-dropdown item **"Start fortune-telling"**, disabled
   when there are no pattern cards. On click:
   - Lock the pattern: set `patternsLocked = true` and reuse the existing
     send-behind stacking logic (as `toggleLockPattern` does).
   - Move all pattern cards up so the topmost sits at `y = 5`
     (shift every pattern card's `y` by `-(minY - 5)`).
   - Call `reloadDeck()` → `placeCards()`: shuffles and deals the deck block on
     top and pushes the pattern below it (**keep the current layout** — this is
     the "already done" separation), and clears every `patternText`.
   - Set `fortuneStepOrder = 1`.
2. **Menus blocked** — while `fortuneActive()`, the **Deck ▾** and **Pattern ▾**
   dropdown buttons are `disabled`.
3. **Ask** — the pattern card with `order === fortuneStepOrder()` is highlighted
   with a bright glow/ring at full opacity; the other pattern cards are dimmed
   (only while the process runs). The question text is already rendered on the
   pattern card.
4. **Pick** — deck cards that have not yet been placed are in *click-to-place*
   mode: a click chooses that card (free-dragging of unplaced pile cards is
   suppressed during the process). On click, the chosen card:
   - moves to the active pattern card's `x`/`y`, comes to the front (`z`), and
     **auto-flips face-up** (`flipped = true`);
   - is assigned `patternText = "{order}. {text}"` of the active pattern card;
   - then `fortuneStepOrder` advances to the next pattern order.
5. **End** — the process ends when either the last pattern card is filled (the
   next order exceeds the maximum pattern `order`) **or** the deck is exhausted
   (`fortuneStepOrder()` exceeds the number of deck cards, i.e. no unplaced card
   remains to pick). On either, set `fortuneStepOrder = null`. The Deck and
   Pattern menus re-enable. The pattern stays locked and all placed cards stay
   in place.

## Component wiring

- **`table-card`** gains a `pickMode` input (default `false`). When `true`,
  `pointerdown` emits a new `cardPick` output instead of starting a drag/select.
  A deck card is in pick mode only while `fortuneActive()` and it has no
  `patternText` yet; placed cards behave normally (draggable, flippable).
- **`table` template** binds `[pickMode]="fortuneActive() && !card.patternText"`
  and `(cardPick)="pickCard(card.id)"`.
- **`table-pattern-card`** gains an `active` input driving the glow highlight; a
  `dimmed` styling applies to non-active pattern cards while the process runs.
  The template passes `[active]="activePatternId() === pattern.id"` and a dimmed
  flag derived from `fortuneActive()`.

## Decisions

- Unplaced pile cards are **click-to-place, not draggable**, during the process
  (avoids ambiguous click-vs-drag).
- Already-placed cards remain **draggable/flippable** so the reader can tidy the
  spread.

## Testing (Vitest)

- **Start**: locks the pattern, normalizes topmost pattern `y` to 5, reloads the
  deck (clearing `patternText`), and lights the pattern card of order 1.
- **Menus blocked**: Deck ▾ and Pattern ▾ buttons are disabled while active.
- **Pick**: clicking an unplaced pile card moves it onto the active pattern
  card's position, flips it face-up, sets `patternText` to `"{order}. {text}"`,
  and advances to the next order.
- **End**: the final pick clears `fortuneStepOrder` and re-enables the menus.
- **Deck exhaustion**: with fewer deck cards than pattern cards, the process ends
  once the last deck card is picked, even though pattern slots remain.
- **placeCards** clears `patternText` on every deck card.

## Out of scope

- Persistence of the reading (deferred with the rest of the table persistence
  work).
- Undo / re-pick of an already-placed card.

# Draw Another — Flip-Back Before Card Update

## Problem

When the user clicks "Draw Another", `flipped` is set to `false` and `drawnCard` is updated simultaneously. During the 0.7s CSS flip-back animation the card is still rotated 180°, so the new card's face is briefly visible before the card completes its return to face-down.

## Goal

The new card should only be set after the flip-back animation completes, so the user never sees the face of the incoming card.

## Solution

**Option A — Delay `drawnCard` update by 700ms**

In `drawAnother()`, set `flipped.set(false)` immediately to start the flip-back animation, then after 700ms call `pickRandom()` to set the new card.

```ts
drawAnother(): void {
  const d = this.deck();
  if (!d) return;
  this.flipped.set(false);
  setTimeout(() => this.pickRandom(d), 700);
}
```

The 700ms matches the CSS transition duration defined in `drawn-card.component.css`:
```css
.card-flipper {
  transition: transform 0.7s cubic-bezier(0.4, 0, 0.2, 1);
}
```

## Scope

- **One file changed:** `fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts`
- No template, CSS, or service changes required.

## Notes

- `pickRandom()` internally calls `flipped.set(false)` — this is a harmless no-op since `flipped` is already `false` at that point.
- If the CSS transition duration is ever changed, the `setTimeout` value must be updated to match.
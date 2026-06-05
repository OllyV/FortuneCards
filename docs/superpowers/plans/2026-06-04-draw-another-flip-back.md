# Draw Another Flip-Back Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delay the new card being set until after the flip-back animation completes so the user never sees the incoming card face during "Draw Another".

**Architecture:** In `drawAnother()`, call `flipped.set(false)` immediately to start the CSS flip-back animation, then use `setTimeout` of 700ms (matching the CSS `transition: transform 0.7s`) before calling `pickRandom()` to set the new card.

**Tech Stack:** Angular 21, TypeScript strict mode, Jasmine + Karma tests

---

### Task 1: Update `drawAnother()` with delayed card pick

**Files:**
- Modify: `fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts:60-63`
- Test: `fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts`

- [ ] **Step 1: Check whether a spec file exists**

Run:
```powershell
Test-Path "fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts"
```
Expected: `True` or `False`. If `False`, the test file needs to be created in Step 2. If `True`, open it and read its existing content before proceeding.

- [ ] **Step 2: Write the failing test**

If the spec file does not exist, create it at `fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts` with this full content:

```typescript
import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RouterModule } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { of } from 'rxjs';
import { DrawnCardComponent } from './drawn-card.component';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1,
  name: 'Test Deck',
  description: '',
  colorIndex: 0,
  cardBackImageUrl: '',
  cards: [
    { id: 1, title: 'Card A', description: 'Desc A', imageUrl: '' },
    { id: 2, title: 'Card B', description: 'Desc B', imageUrl: '' },
  ]
};

describe('DrawnCardComponent', () => {
  let component: DrawnCardComponent;
  let fixture: ComponentFixture<DrawnCardComponent>;
  let deckServiceSpy: jasmine.SpyObj<DeckService>;

  beforeEach(async () => {
    deckServiceSpy = jasmine.createSpyObj('DeckService', ['getDeck']);
    deckServiceSpy.getDeck.and.returnValue(of(mockDeck));

    await TestBed.configureTestingModule({
      declarations: [DrawnCardComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: deckServiceSpy },
      ],
      imports: [RouterModule.forRoot([])]
    }).compileComponents();

    fixture = TestBed.createComponent(DrawnCardComponent);
    component = fixture.componentInstance;
  });

  it('should keep flipped false and not update drawnCard until animation completes on drawAnother', fakeAsync(() => {
    // Simulate a flipped card
    component.deck.set(mockDeck);
    component.drawnCard.set(mockDeck.cards![0]);
    component.flipped.set(true);

    const cardBefore = component.drawnCard();

    component.drawAnother();

    // Immediately after: flipped should be false, card should NOT have changed yet
    expect(component.flipped()).toBe(false);
    expect(component.drawnCard()).toBe(cardBefore);

    // After 700ms: card should now be updated
    tick(700);
    expect(component.drawnCard()).not.toBeNull();
  }));
});
```

If the spec file already exists, add the `it(...)` block above into the existing `describe` block, importing `fakeAsync` and `tick` if not already imported.

- [ ] **Step 3: Run the test to verify it fails**

```powershell
cd fortunecards.client
npx ng test --include="**/drawn-card.component.spec.ts" --watch=false --browsers=ChromeHeadless
```

Expected: FAIL — the test will fail because `drawAnother()` currently updates `drawnCard` immediately (no delay).

- [ ] **Step 4: Update `drawAnother()` in the component**

Open `fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts` and replace the existing `drawAnother()` method (lines 60–63):

```typescript
// Before
drawAnother(): void {
  const d = this.deck();
  if (d) this.pickRandom(d);
}
```

With:

```typescript
drawAnother(): void {
  const d = this.deck();
  if (!d) return;
  this.flipped.set(false);
  setTimeout(() => this.pickRandom(d), 700);
}
```

- [ ] **Step 5: Run the test to verify it passes**

```powershell
cd fortunecards.client
npx ng test --include="**/drawn-card.component.spec.ts" --watch=false --browsers=ChromeHeadless
```

Expected: PASS

- [ ] **Step 6: Run the full test suite to check for regressions**

```powershell
cd fortunecards.client
npx ng test --watch=false --browsers=ChromeHeadless
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```powershell
git add fortunecards.client/src/app/components/drawn-card/drawn-card.component.ts
git add fortunecards.client/src/app/components/drawn-card/drawn-card.component.spec.ts
git commit -m "fix: delay card update until flip-back animation completes on draw another"
```
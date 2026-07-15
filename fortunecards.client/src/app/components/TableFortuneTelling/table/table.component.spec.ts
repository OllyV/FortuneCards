import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { TableComponent } from './table.component';
import { AuthService } from '../../../services/auth.service';
import { DeckService } from '../../../services/deck.service';
import { TableDeckCard } from '../../../models/table';
import { Deck } from '../../../models/deck';
import { Card } from '../../../models/card';

describe('TableComponent', () => {
  let component: TableComponent;
  let fixture: ComponentFixture<TableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn: signal(false), currentUser: signal(null), login: vi.fn(), logout: vi.fn() } },
        { provide: DeckService, useValue: { getDecks: () => of([]), getDeck: () => of(null) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function tableEl(): HTMLElement {
    return fixture.nativeElement.querySelector('.table');
  }

  function makeDeckCard(overrides: Partial<TableDeckCard> = {}): TableDeckCard {
    return {
      kind: 'deck', id: 'c1', x: 0, y: 0, rotation: 0, flipped: false,
      deckId: 1, cardId: 1, colorIndex: 0,
      frontImageUrl: '/images/front.png', backImageUrl: '/images/back.png',
      title: 'The Sun', description: 'A bright card.',
      ...overrides,
    };
  }

  beforeEach(() => {
    component.cards.set([makeDeckCard({ id: 'test-card', x: 5, y: 5 })]);
    fixture.detectChanges();
  });

  it('has spec defaults: beige, 15% cards, nothing selected', () => {
    expect(component.tableColor()).toBe('beige');
    expect(component.cardSizePercent()).toBe(15);
    expect(component.selectedCardId()).toBeNull();
  });

  it('renders the table with its color and one table-card', () => {
    expect(tableEl().getAttribute('data-color')).toBe('beige');
    expect(fixture.nativeElement.querySelectorAll('table-card').length).toBe(1);
  });

  it('falls back to 100vh height before the table is measured', () => {
    expect(component.heightStyle()).toBe('100vh');
  });

  it('derives pixel height from tableHeightPercent and tableWidthPx', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    expect(component.heightStyle()).toBe('600px');
  });

  it('selectCard selects; pointerdown on the table background deselects', () => {
    component.selectCard('test-card');
    expect(component.selectedCardId()).toBe('test-card');
    fixture.detectChanges();
    tableEl().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(component.selectedCardId()).toBeNull();
  });

  it('pointerdown bubbling from a child does not deselect', () => {
    component.selectCard('test-card');
    fixture.detectChanges();
    const child = fixture.nativeElement.querySelector('table-card')!;
    child.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(component.selectedCardId()).toBe('test-card');
  });

  it('selecting a card brings it to the front and keeps prior selections beneath', () => {
    component.cards.set([makeDeckCard({ id: 'a' }), makeDeckCard({ id: 'b' })]);
    const z = (id: string) => component.cards().find((c) => c.id === id)!.z!;
    component.selectCard('a');
    component.selectCard('b');
    expect(z('b')).toBeGreaterThan(z('a'));
    // re-selecting the first card lifts it back above the second
    component.selectCard('a');
    expect(z('a')).toBeGreaterThan(z('b'));
  });

  it('front ordering is shared across deck and pattern cards', () => {
    component.addPatternCard();
    const patternId = component.patternCards()[0].id;
    component.selectCard(patternId);
    component.selectCard('test-card');
    expect(component.cards()[0].z!).toBeGreaterThan(component.patternCards()[0].z!);
  });

  it('flipCard toggles the flipped flag', () => {
    component.flipCard('test-card');
    expect(component.cards()[0].flipped).toBe(true);
    component.flipCard('test-card');
    expect(component.cards()[0].flipped).toBe(false);
  });

  it('moveCard clamps the card inside the table', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    // card is 15% wide, 22.5% tall (aspect 2/3) → max x = 85, max y = 37.5
    component.moveCard('test-card', { x: 95, y: 95 });
    expect(component.cards()[0]).toMatchObject({ x: 85, y: 37.5 });
    component.moveCard('test-card', { x: -10, y: -10 });
    expect(component.cards()[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('rotateCard normalizes the angle into [0, 360)', () => {
    component.rotateCard('test-card', 370);
    expect(component.cards()[0].rotation).toBe(10);
    component.rotateCard('test-card', -10);
    expect(component.cards()[0].rotation).toBe(350);
  });

  it('opens the settings dialog from the gear button and applies changes', () => {
    expect(fixture.nativeElement.querySelector('table-settings-dialog')).toBeNull();
    (fixture.nativeElement.querySelector('.settings-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table-settings-dialog')).not.toBeNull();

    (fixture.nativeElement.querySelector('.swatch[data-color="pink"]') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.tableColor()).toBe('pink');
    expect(tableEl().getAttribute('data-color')).toBe('pink');

    const slider: HTMLInputElement = fixture.nativeElement.querySelector('input[type="range"]');
    slider.value = '40';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(component.cardSizePercent()).toBe(40);

    (fixture.nativeElement.querySelector('.dialog-close') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('table-settings-dialog')).toBeNull();
  });

  it('the + and − buttons change table height by the current card size', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.height-btn--plus') as HTMLElement).click();
    expect(component.tableHeightPercent()).toBe(115);
    (fixture.nativeElement.querySelector('.height-btn--minus') as HTMLElement).click();
    expect(component.tableHeightPercent()).toBe(100);
  });

  it('minHeightPercent is the lowest card bottom edge + 5% of table width', () => {
    // test card at y=5, card height = 15 * 1.5 = 22.5 → min = 5 + 22.5 + 5 = 32.5
    expect(component.minHeightPercent()).toBe(32.5);
    component.moveCard('test-card', { x: 0, y: 50 });
    component.tableHeightPercent.set(100); // allow the move first
    component.moveCard('test-card', { x: 0, y: 50 });
    expect(component.minHeightPercent()).toBe(77.5);
  });

  it('decreaseHeight clamps to the minimum height', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(40); // min is 32.5 (card at y=5)
    component.decreaseHeight(); // 40 - 15 = 25 → clamped to 32.5
    expect(component.tableHeightPercent()).toBe(32.5);
  });

  it('re-clamps table height when the card size grows past the minimum', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(40);
    component.onCardSizeChange(50); // card at y=5 → min becomes 5 + 50 * 1.5 + 5 = 85
    expect(component.cardSizePercent()).toBe(50);
    expect(component.tableHeightPercent()).toBe(85);
  });

  it('starts with no pattern cards and unlocked', () => {
    expect(component.patternCards()).toEqual([]);
    expect(component.patternsLocked()).toBe(false);
  });

  it('addPatternCard appends cards with incrementing order', () => {
    component.addPatternCard();
    component.addPatternCard();
    const patterns = component.patternCards();
    expect(patterns.length).toBe(2);
    expect(patterns.map((p) => p.order)).toEqual([1, 2]);
    expect(patterns.every((p) => p.kind === 'pattern' && !p.locked)).toBe(true);
  });

  it('toggleLockPattern locks then unlocks all pattern cards', () => {
    component.addPatternCard();
    component.addPatternCard();
    component.toggleLockPattern();
    expect(component.patternsLocked()).toBe(true);
    expect(component.patternCards().every((p) => p.locked)).toBe(true);
    component.toggleLockPattern();
    expect(component.patternsLocked()).toBe(false);
    expect(component.patternCards().every((p) => !p.locked)).toBe(true);
  });

  it('toggleLockPattern sends pattern cards behind the deck cards, keeping their relative order', () => {
    component.cards.set([makeDeckCard({ id: 'd1', z: 0 }), makeDeckCard({ id: 'd2', z: 3 })]);
    component.addPatternCard();
    component.addPatternCard();
    const [p1, p2] = component.patternCards();
    component.selectCard(p1.id); // p1 gets a z
    component.selectCard(p2.id); // p2 ends up in front of p1
    component.toggleLockPattern();
    const patterns = component.patternCards();
    const minDeckZ = Math.min(...component.cards().map((c) => c.z ?? 0));
    expect(patterns.every((p) => (p.z ?? 0) < minDeckZ)).toBe(true);
    const zp1 = patterns.find((p) => p.id === p1.id)!.z!;
    const zp2 = patterns.find((p) => p.id === p2.id)!.z!;
    expect(zp2).toBeGreaterThan(zp1); // relative order preserved
  });

  it('movePatternCard clamps inside the table and is a no-op when locked', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.movePatternCard(id, { x: 95, y: 95 }); // clamp to maxX=85, maxY=37.5
    expect(component.patternCards()[0]).toMatchObject({ x: 85, y: 37.5 });
    component.toggleLockPattern();
    component.movePatternCard(id, { x: 0, y: 0 });
    expect(component.patternCards()[0]).toMatchObject({ x: 85, y: 37.5 }); // unchanged
  });

  it('rotatePatternCard normalizes and is a no-op when locked', () => {
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.rotatePatternCard(id, 370);
    expect(component.patternCards()[0].rotation).toBe(10);
    component.toggleLockPattern();
    component.rotatePatternCard(id, 90);
    expect(component.patternCards()[0].rotation).toBe(10); // unchanged
  });

  it('setPatternText updates the pattern text', () => {
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.setPatternText(id, 'Present');
    expect(component.patternCards()[0].text).toBe('Present');
  });

  it('minHeightPercent accounts for pattern cards too', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.movePatternCard(id, { x: 0, y: 50 }); // pattern bottom = 50 + 22.5 = 72.5 → min 77.5
    expect(component.minHeightPercent()).toBe(77.5);
  });

  function openMenu(btn: string): void {
    (fixture.nativeElement.querySelector(btn) as HTMLElement).click();
    fixture.detectChanges();
  }

  it('the Pattern menu adds pattern cards and toggles the lock', () => {
    openMenu('.pattern-menu-btn');
    (fixture.nativeElement.querySelector('.add-pattern-item') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.patternCards().length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('table-pattern-card').length).toBe(1);
    // the menu closes on selection, so reopen it to toggle the lock
    openMenu('.pattern-menu-btn');
    (fixture.nativeElement.querySelector('.lock-pattern-item') as HTMLElement).click();
    expect(component.patternsLocked()).toBe(true);
  });

  it('opening one menu closes the other', () => {
    openMenu('.deck-menu-btn');
    expect(component.deckMenuOpen()).toBe(true);
    openMenu('.pattern-menu-btn');
    expect(component.patternMenuOpen()).toBe(true);
    expect(component.deckMenuOpen()).toBe(false);
  });

  function card(id: number): Card {
    return { id, title: `t${id}`, description: '', imageUrl: `/images/${id}.png`, createdAt: '', deckId: 7 };
  }
  function deck(cards: Card[]): Deck {
    return {
      id: 7, name: 'D', description: null, createdAt: '', emoji: '🔮',
      colorIndex: 2, cardBackImageUrl: '/images/back.png', isPublic: false, isOwner: true, cards,
    };
  }

  it('loadDeck replaces deck cards but keeps pattern cards', () => {
    component.addPatternCard();
    component.loadDeck(deck([card(1), card(2)]));
    expect(component.cards().length).toBe(2);
    expect(component.cards().every((c) => c.deckId === 7 && !c.flipped)).toBe(true);
    expect(component.patternCards().length).toBe(1);
  });

  it('loadDeck lays a single row as a justified cascade, stacked by index (cardSize 15% → stride 3)', () => {
    component.loadDeck(deck([card(1), card(2), card(3)]));
    expect(component.cards().map((c) => c.x)).toEqual([5, 8, 11]);
    expect(component.cards().every((c) => c.y === 7)).toBe(true);
    expect(component.cards().map((c) => c.z)).toEqual([0, 1, 2]);
  });

  it('placeCards deals cards into the slots in the order shuffle returns', () => {
    // Pin the shuffle to a reversal so placement order is deterministic to assert.
    vi.spyOn(component as unknown as { shuffle(items: TableDeckCard[]): TableDeckCard[] }, 'shuffle')
      .mockImplementation((items) => [...items].reverse());
    component.loadDeck(deck([card(1), card(2), card(3)]));
    // Reversed deck → slots fill back-to-front by cardId.
    expect(component.cards().map((c) => c.cardId)).toEqual([3, 2, 1]);
  });

  it('selecting a freshly loaded card brings it above the deck cascade', () => {
    component.loadDeck(deck([card(1), card(2), card(3)]));
    const zOf = (i: number) => component.cards()[i].z!;
    // the first card starts at the bottom of the cascade (z = 0)
    component.selectCard(component.cards()[0].id);
    expect(zOf(0)).toBeGreaterThan(Math.max(zOf(1), zOf(2)));
  });

  it('loadDeck wraps overflow onto a second row below the first', () => {
    component.cardSizePercent.set(50); // n=5 per row, cardHeight 75
    component.loadDeck(deck([1, 2, 3, 4, 5, 6, 7].map(card)));
    // n=5: indices 5 and 6 land on row 1 at y = 7 + (75 + 5) = 87
    expect(component.cards()[5]).toMatchObject({ x: 5, y: 87 });
    expect(component.cards()[6]).toMatchObject({ x: 15, y: 87 });
  });

  it('loadDeck pushes existing pattern cards below the deck block without extending a table that still fits', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    component.addPatternCard(); // pattern at y=5
    component.loadDeck(deck([card(1), card(2), card(3)])); // 1 line
    // distance = 1*(22.5 + 5) + 5 - 5 = 27.5 → pattern moves to y=32.5
    expect(component.patternCards()[0].y).toBe(32.5);
    // pushed pattern bottom = 32.5 + 22.5 = 55 → min 60, still inside the 100 table
    expect(component.tableHeightPercent()).toBe(100);
  });

  it('loadDeck extends the table only enough to fit a pattern pushed past its bottom edge', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(40);
    component.addPatternCard(); // pattern at y=5
    component.loadDeck(deck([card(1), card(2), card(3)])); // pattern pushed to y=32.5
    expect(component.patternCards()[0].y).toBe(32.5);
    // pattern bottom 55 now sits below the 40 table → extend to fit: 55 + 5 = 60
    expect(component.tableHeightPercent()).toBe(60);
  });

  it('loadDeck floors the height to fit new cards when nothing else is on the table', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(10);
    component.loadDeck(deck([card(1), card(2), card(3)]));
    // one line: lowest bottom = 7 + 22.5 = 29.5 → min height 34.5
    expect(component.tableHeightPercent()).toBe(34.5);
  });

  it('loadDeck with an empty deck clears deck cards without pushing patterns', () => {
    component.tableHeightPercent.set(100);
    component.addPatternCard();
    component.loadDeck(deck([]));
    expect(component.cards()).toEqual([]);
    expect(component.patternCards().length).toBe(1);
    expect(component.patternCards()[0].y).toBe(5);
  });

  it('loadDeck carries the card title and description onto the table cards', () => {
    component.loadDeck(deck([card(1), card(2)]));
    // Order is randomized by placeCards, so compare as an unordered set.
    expect(component.cards().map((c) => c.title).sort()).toEqual(['t1', 't2']);
    expect(component.cards().every((c) => c.description === '')).toBe(true);
  });

  it('opens the deck-selector dialog from the Deck menu', () => {
    expect(fixture.nativeElement.querySelector('deck-selector')).toBeNull();
    openMenu('.deck-menu-btn');
    (fixture.nativeElement.querySelector('.select-deck-item') as HTMLElement).click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('deck-selector')).not.toBeNull();
  });

  it('onDeckSelected loads the deck and closes the dialog', () => {
    const spy = vi.spyOn(component, 'loadDeck');
    component.deckSelectorOpen.set(true);
    component.onDeckSelected(deck([card(1)]));
    expect(spy).toHaveBeenCalledTimes(1);
    expect(component.deckSelectorOpen()).toBe(false);
  });

  it('Re-load deck is disabled until cards are on the table, then resets them to their initial layout', () => {
    component.cards.set([]); // clear the seeded card: nothing loaded yet
    fixture.detectChanges();
    openMenu('.deck-menu-btn');
    expect((fixture.nativeElement.querySelector('.reload-deck-item') as HTMLButtonElement).disabled).toBe(true);
    component.closeMenus();
    fixture.detectChanges();

    // Pin the shuffle to identity so the disturbed card returns to the same slot on re-load.
    vi.spyOn(component as unknown as { shuffle(items: TableDeckCard[]): TableDeckCard[] }, 'shuffle')
      .mockImplementation((items) => items);
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(100);
    component.onDeckSelected(deck([card(1), card(2), card(3)]));
    const movedId = component.cards()[0].id;
    // disturb the first card: move it, rotate it, flip it
    component.moveCard(movedId, { x: 40, y: 40 });
    component.rotateCard(movedId, 90);
    component.flipCard(movedId);
    fixture.detectChanges();

    openMenu('.deck-menu-btn');
    const reload = fixture.nativeElement.querySelector('.reload-deck-item') as HTMLButtonElement;
    expect(reload.disabled).toBe(false);
    reload.click();

    // the same card object is reset to its clean starting position, not recreated
    const c0 = component.cards()[0];
    expect(c0.id).toBe(movedId);
    expect(c0).toMatchObject({ x: 5, y: 7, rotation: 0, flipped: false });
  });

  it('openCardInfo sets infoCardId and infoCard resolves to that card', () => {
    component.loadDeck(deck([card(1), card(2)]));
    const target = component.cards()[1];
    component.openCardInfo(target.id);
    expect(component.infoCardId()).toBe(target.id);
    expect(component.infoCard()!.id).toBe(target.id);
  });

  it('renders card-info-dialog while a card info is open and closing clears it', () => {
    component.loadDeck(deck([card(1)]));
    expect(fixture.nativeElement.querySelector('card-info-dialog')).toBeNull();
    component.openCardInfo(component.cards()[0].id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('card-info-dialog')).not.toBeNull();
    (fixture.nativeElement.querySelector('card-info-dialog .dialog-backdrop') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.infoCardId()).toBeNull();
    expect(fixture.nativeElement.querySelector('card-info-dialog')).toBeNull();
  });

  it("the info dialog renders the selected card's picture, title and description through the table wiring", () => {
    const distinctCard: Card = {
      id: 42,
      title: 'The Moon',
      description: 'A card of illusion and intuition.',
      imageUrl: '/images/moon.png',
      createdAt: '',
      deckId: 7,
    };
    component.loadDeck(deck([distinctCard]));
    component.openCardInfo(component.cards()[0].id);
    fixture.detectChanges();

    const dialog = fixture.nativeElement.querySelector('card-info-dialog') as HTMLElement;
    const img = dialog.querySelector('.card-info-img') as HTMLImageElement;
    const title = dialog.querySelector('.card-info-title') as HTMLElement;
    const description = dialog.querySelector('.card-info-description') as HTMLElement;

    expect(img.src.endsWith(distinctCard.imageUrl)).toBe(true);
    expect(title.textContent).toContain(distinctCard.title);
    expect(description.textContent).toContain(distinctCard.description);
    // and cross-check they didn't land in each other's slot (would catch a swapped binding)
    expect(title.textContent).not.toContain(distinctCard.description);
    expect(description.textContent).not.toContain(distinctCard.title);
  });

  it('placeCards clears patternText on every deck card when the deck is re-loaded', () => {
    component.loadDeck(deck([card(1), card(2)]));
    // simulate a prior reading having stamped a card
    component.cards.update((cards) =>
      cards.map((c, i) => (i === 0 ? { ...c, patternText: '1. Position 1' } : c))
    );
    component.reloadDeck();
    expect(component.cards().every((c) => c.patternText === undefined)).toBe(true);
  });

  describe('fortune-telling', () => {
    beforeEach(() => {
      component.cards.set([]); // drop the seeded single card
      component.tableWidthPx.set(1000);
      component.tableHeightPercent.set(100);
      // deterministic deck order so placement is assertable
      vi.spyOn(component as unknown as { shuffle(items: TableDeckCard[]): TableDeckCard[] }, 'shuffle')
        .mockImplementation((items) => items);
    });

    it('start locks the pattern, reloads the deck (clearing patternText) and asks order 1', () => {
      component.addPatternCard(); // order 1
      component.addPatternCard(); // order 2
      component.loadDeck(deck([card(1), card(2), card(3)]));

      component.startFortuneTelling();

      expect(component.patternsLocked()).toBe(true);
      expect(component.fortuneStepOrder()).toBe(1);
      expect(component.fortuneActive()).toBe(true);
      const active = component.patternCards().find((p) => p.id === component.activePatternId());
      expect(active!.order).toBe(1);
      expect(component.cards().every((c) => c.patternText === undefined)).toBe(true);
    });

    it('start lifts the topmost pattern card to y=5 before dealing the deck', () => {
      component.addPatternCard();
      component.addPatternCard();
      // move both patterns down so the lift is observable
      component.patternCards.update((cards) => cards.map((c) => ({ ...c, y: c.y + 30 })));
      // stub placeCards so it doesn't push the pattern back down after the lift
      vi.spyOn(component as unknown as { placeCards(cards: TableDeckCard[]): void }, 'placeCards')
        .mockImplementation(() => {});

      component.startFortuneTelling();

      const minY = Math.min(...component.patternCards().map((p) => p.y));
      expect(minY).toBe(5);
    });

    it('pickCard deals the chosen card onto the active pattern slot, flips it, stamps patternText and advances', () => {
      component.addPatternCard(); // order 1
      component.addPatternCard(); // order 2
      component.setPatternText(component.patternCards()[0].id, 'Position 1');
      component.loadDeck(deck([card(1), card(2), card(3)]));
      component.startFortuneTelling();

      const slot1 = component.patternCards().find((p) => p.id === component.activePatternId())!;
      const chosen = component.cards()[0];
      component.pickCard(chosen.id);

      const placed = component.cards().find((c) => c.id === chosen.id)!;
      expect(placed).toMatchObject({ x: slot1.x, y: slot1.y, flipped: true, patternText: '1. Position 1' });
      // it comes to the front
      expect(placed.z!).toBeGreaterThanOrEqual(Math.max(...component.cards().map((c) => c.z ?? 0)));
      // and the next question is now asked
      expect(component.fortuneStepOrder()).toBe(2);
    });

    it('ends when the last pattern card is filled', () => {
      component.addPatternCard(); // order 1
      component.addPatternCard(); // order 2
      component.loadDeck(deck([card(1), card(2), card(3)]));
      component.startFortuneTelling();

      component.pickCard(component.cards()[0].id); // fills order 1 → step 2
      component.pickCard(component.cards()[1].id); // fills order 2 → done
      expect(component.fortuneStepOrder()).toBeNull();
      expect(component.fortuneActive()).toBe(false);
    });

    it('ends when the deck is exhausted before all pattern cards are filled', () => {
      component.addPatternCard(); // order 1
      component.addPatternCard(); // order 2
      component.addPatternCard(); // order 3
      component.loadDeck(deck([card(1), card(2)])); // only two cards
      component.startFortuneTelling();

      component.pickCard(component.cards()[0].id); // step → 2
      component.pickCard(component.cards()[1].id); // deck exhausted → done, order 3 never asked
      expect(component.fortuneStepOrder()).toBeNull();
    });
  });
});

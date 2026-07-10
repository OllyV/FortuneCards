import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TableComponent } from './table.component';
import { AuthService } from '../../../services/auth.service';
import { TableDeckCard } from '../../../models/table';

describe('TableComponent', () => {
  let component: TableComponent;
  let fixture: ComponentFixture<TableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn: signal(false), currentUser: signal(null), login: vi.fn(), logout: vi.fn() } },
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

  function key(type: 'keydown' | 'keyup', key: string): void {
    document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }

  it('rotates the selected card 1° per arrow keydown while R is held', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(2);
    key('keydown', 'ArrowLeft');
    expect(component.cards()[0].rotation).toBe(1);
  });

  it('ignores arrows when R is not held', () => {
    component.selectCard('test-card');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('stops rotating after R is released', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    key('keyup', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('ignores R+arrows when no card is selected', () => {
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('resets the held R flag when the window loses focus', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    window.dispatchEvent(new Event('blur'));
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('ignores R+arrows while the settings dialog is open', () => {
    component.selectCard('test-card');
    component.settingsOpen.set(true);
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
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

  it('R+arrows rotate a selected pattern card, but not when locked', () => {
    component.addPatternCard();
    const id = component.patternCards()[0].id;
    component.selectCard(id);
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    expect(component.patternCards()[0].rotation).toBe(1);
    component.toggleLockPattern();
    key('keydown', 'ArrowRight');
    expect(component.patternCards()[0].rotation).toBe(1); // unchanged while locked
  });

  it('the Add pattern card and Lock pattern buttons drive the signals', () => {
    (fixture.nativeElement.querySelector('.add-pattern-btn') as HTMLElement).click();
    fixture.detectChanges();
    expect(component.patternCards().length).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('table-pattern-card').length).toBe(1);
    (fixture.nativeElement.querySelector('.lock-pattern-btn') as HTMLElement).click();
    expect(component.patternsLocked()).toBe(true);
  });
});

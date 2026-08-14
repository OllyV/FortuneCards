import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { DeckHeroComponent } from './deck-hero.component';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('DeckHeroComponent', () => {
  let fixture: ComponentFixture<DeckHeroComponent>;

  async function setup(over: Partial<{ isOwner: boolean; isFavorite: boolean; isLoggedIn: boolean }> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [DeckHeroComponent, getTranslocoTestingModule()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckHeroComponent);
    fixture.componentRef.setInput('name', 'Adventure');
    fixture.componentRef.setInput('emoji', '🌈');
    fixture.componentRef.setInput('description', 'Bold quests');
    fixture.componentRef.setInput('cardCount', 12);
    fixture.componentRef.setInput('colorIndex', 0);
    fixture.componentRef.setInput('isOwner', over.isOwner ?? false);
    fixture.componentRef.setInput('isFavorite', over.isFavorite ?? false);
    fixture.componentRef.setInput('isLoggedIn', over.isLoggedIn ?? false);
    fixture.detectChanges();
  }

  function hero(): HTMLElement { return fixture.nativeElement.querySelector('.deck-hero'); }

  it('renders emoji, name and meta, with the color gradient applied', async () => {
    await setup();
    expect(hero().textContent).toContain('🌈');
    expect(hero().textContent).toContain('Adventure');
    expect(hero().textContent).toContain('Bold quests');
    const style = hero().getAttribute('style') ?? '';
    expect(style.includes('#B2FEFA') || style.includes('rgb(178, 254, 250)')).toBe(true);
  });

  it('always shows Draw card and emits drawCard on click', async () => {
    await setup();
    const emit = vi.fn();
    fixture.componentInstance.drawCard.subscribe(emit);
    const btn = fixture.nativeElement.querySelector('.hero-draw') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('owner sees Edit and Add buttons that emit; no favourite', async () => {
    await setup({ isOwner: true, isLoggedIn: true });
    const editDeck = vi.fn();
    const addCard = vi.fn();
    fixture.componentInstance.editDeck.subscribe(editDeck);
    fixture.componentInstance.addCard.subscribe(addCard);
    (fixture.nativeElement.querySelector('.hero-edit') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.hero-add') as HTMLButtonElement).click();
    expect(editDeck).toHaveBeenCalledTimes(1);
    expect(addCard).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
  });

  it('hides the Edit/Add buttons when flagged owner but not logged in (defense-in-depth)', async () => {
    await setup({ isOwner: true, isLoggedIn: false });
    expect(fixture.nativeElement.querySelector('.hero-edit')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-add')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-draw')).not.toBeNull();
  });

  it('logged-in non-owner sees a favourite toggle that emits; no Edit/Add buttons', async () => {
    await setup({ isOwner: false, isLoggedIn: true });
    const fav = vi.fn();
    fixture.componentInstance.toggleFavorite.subscribe(fav);
    const btn = fixture.nativeElement.querySelector('.hero-fav') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(fav).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.hero-edit')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-add')).toBeNull();
  });

  it('anonymous non-owner sees only Draw card', async () => {
    await setup({ isOwner: false, isLoggedIn: false });
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-edit')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-draw')).not.toBeNull();
  });
});

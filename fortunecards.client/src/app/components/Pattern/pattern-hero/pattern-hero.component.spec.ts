import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PatternHeroComponent } from './pattern-hero.component';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('PatternHeroComponent', () => {
  let fixture: ComponentFixture<PatternHeroComponent>;

  async function setup(over: Partial<{ isOwner: boolean; isFavorite: boolean; isLoggedIn: boolean }> = {}): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PatternHeroComponent, getTranslocoTestingModule()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternHeroComponent);
    fixture.componentRef.setInput('name', 'Celtic Cross');
    fixture.componentRef.setInput('emoji', '🔮');
    fixture.componentRef.setInput('description', 'Ten positions');
    fixture.componentRef.setInput('cardCount', 10);
    fixture.componentRef.setInput('colorIndex', 0);
    fixture.componentRef.setInput('isOwner', over.isOwner ?? false);
    fixture.componentRef.setInput('isFavorite', over.isFavorite ?? false);
    fixture.componentRef.setInput('isLoggedIn', over.isLoggedIn ?? false);
    fixture.detectChanges();
  }

  function hero(): HTMLElement { return fixture.nativeElement.querySelector('.pattern-hero'); }

  it('renders emoji, name and meta, with the color gradient applied', async () => {
    await setup();
    expect(hero().textContent).toContain('🔮');
    expect(hero().textContent).toContain('Celtic Cross');
    expect(hero().textContent).toContain('Ten positions');
    const style = hero().getAttribute('style') ?? '';
    expect(style.includes('#B2FEFA') || style.includes('rgb(178, 254, 250)')).toBe(true);
  });

  it('always shows Use pattern and emits usePattern on click', async () => {
    await setup();
    const emit = vi.fn();
    fixture.componentInstance.usePattern.subscribe(emit);
    const btn = fixture.nativeElement.querySelector('.hero-use') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(emit).toHaveBeenCalledTimes(1);
  });

  it('owner sees Edit buttons that emit; no favourite', async () => {
    await setup({ isOwner: true, isLoggedIn: true });
    const editPattern = vi.fn();
    const editQuestions = vi.fn();
    fixture.componentInstance.editPattern.subscribe(editPattern);
    fixture.componentInstance.editQuestions.subscribe(editQuestions);
    (fixture.nativeElement.querySelector('.hero-edit-pattern') as HTMLButtonElement).click();
    (fixture.nativeElement.querySelector('.hero-edit-questions') as HTMLButtonElement).click();
    expect(editPattern).toHaveBeenCalledTimes(1);
    expect(editQuestions).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
  });

  it('logged-in non-owner sees a favourite toggle that emits; no Edit buttons', async () => {
    await setup({ isOwner: false, isLoggedIn: true });
    const fav = vi.fn();
    fixture.componentInstance.toggleFavorite.subscribe(fav);
    const btn = fixture.nativeElement.querySelector('.hero-fav') as HTMLButtonElement;
    expect(btn).not.toBeNull();
    btn.click();
    expect(fav).toHaveBeenCalledTimes(1);
    expect(fixture.nativeElement.querySelector('.hero-edit-pattern')).toBeNull();
  });

  it('anonymous non-owner sees neither Edit nor favourite', async () => {
    await setup({ isOwner: false, isLoggedIn: false });
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
    expect(fixture.nativeElement.querySelector('.hero-edit-pattern')).toBeNull();
  });
});

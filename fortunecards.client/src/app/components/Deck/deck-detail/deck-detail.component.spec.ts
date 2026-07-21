import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CommonModule } from '@angular/common';
import { DeckDetailComponent } from './deck-detail.component';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { Deck } from '../../../models/deck';
import { AuthService } from '../../../services/auth.service';
import { DeckService } from '../../../services/deck.service';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: 'Bold quests',
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cards: [], isPublic: false, isOwner: false, isFavorite: false
};

describe('DeckDetailComponent', () => {
  let component: DeckDetailComponent;
  let fixture: ComponentFixture<DeckDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DeckDetailComponent, CommonModule, RouterModule.forRoot([]), NavigationBar],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: AuthService, useValue: { isLoggedIn: () => true, currentUser: signal({ id: 1, displayName: 'Test User', email: 'test@example.com', avatarUrl: null }) } },
        { provide: DeckService, useValue: { getDeck: () => of(mockDeck), addFavorite: vi.fn(() => of(void 0)), removeFavorite: vi.fn(() => of(void 0)) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckDetailComponent);
    component = fixture.componentInstance;
    // Trigger ngOnInit (and its synchronous mock getDeck() resolution) now, so that
    // individual tests can safely override component.deck afterwards without the
    // completed route/getDeck subscription clobbering their override on the next
    // detectChanges() call.
    fixture.detectChanges();
  });

  it('should render the deck hero banner with emoji and name', () => {
    component.deck.set(mockDeck);
    component.loading.set(false);
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.deck-hero');
    expect(hero.textContent).toContain('🌈');
    expect(hero.textContent).toContain('Adventure');
  });

  it('should apply gradient to hero banner', () => {
    component.deck.set(mockDeck);
    component.loading.set(false);
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.deck-hero');
    // Browsers normalize hex colors to rgb() in style attributes
    const style = hero.getAttribute('style') ?? '';
    // colorIndex 0 → gradient from #B2FEFA; browsers normalize hex to rgb() in style attributes
    const hasHex = style.includes('#B2FEFA');
    const hasRgb = style.includes('rgb(178, 254, 250)');
    expect(hasHex || hasRgb).toBe(true);
  });

  it('goBack() returns to /decks/mine when the current user owns the deck', () => {
    component.deck.set({ ...mockDeck, isOwner: true });
    const navSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/decks/mine']);
  });

  it('goBack() returns to /decks/search when the user does not own the deck', () => {
    component.deck.set({ ...mockDeck, isOwner: false });
    const navSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/decks/search']);
  });

  it('goBack() falls back to /decks/search when the deck has not loaded', () => {
    component.deck.set(null);
    const navSpy = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(navSpy).toHaveBeenCalledWith(['/decks/search']);
  });

  it('shows the hero favourite star for a non-owned deck when logged in', () => {
    component.deck.set({ ...mockDeck, isOwner: false });
    component.loading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero-fav')).not.toBeNull();
  });

  it('hides the hero favourite star when the user owns the deck', () => {
    component.deck.set({ ...mockDeck, isOwner: true });
    component.loading.set(false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.hero-fav')).toBeNull();
  });

  it('toggleFavorite flips isFavorite and calls the service', () => {
    component.deck.set({ ...mockDeck, isOwner: false, isFavorite: false });
    const svc = TestBed.inject(DeckService) as unknown as { addFavorite: ReturnType<typeof vi.fn> };
    component.toggleFavorite();
    expect(component.deck()!.isFavorite).toBe(true);
    expect(svc.addFavorite).toHaveBeenCalledWith(1);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DeckListComponent } from './deck-list.component';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck } from '../../../models/deck';

const ownedDeck: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 3, isPublic: false, isOwner: true, isFavorite: false
};
const publicDeck: Deck = {
  id: 2, name: 'Mystic Tarot', description: 'ancient wisdom',
  createdAt: '2026-01-02', emoji: '🔮', colorIndex: 1,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 5, isPublic: true, isOwner: false, isFavorite: false
};

function configure(mode: 'mine' | 'search') {
  const mockDeckService = {
    getDecks: () => of([ownedDeck, publicDeck]),
    deleteDeck: () => of(void 0),
    addFavorite: vi.fn(() => of(void 0)),
    removeFavorite: vi.fn(() => of(void 0)),
  };
  return TestBed.configureTestingModule({
    imports: [DeckListComponent, CommonModule, RouterModule.forRoot([]), NavigationBar],
    providers: [
      provideZonelessChangeDetection(),
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: DeckService, useValue: mockDeckService },
      { provide: ActivatedRoute, useValue: { data: of({ mode }) } },
      { provide: AuthService, useValue: { isLoggedIn: signal(true), currentUser: signal({ displayName: 'Test User', email: 'test@example.com' }) } },
    ],
  }).compileComponents();
}

describe('DeckListComponent', () => {
  let component: DeckListComponent;
  let fixture: ComponentFixture<DeckListComponent>;

  describe('mine mode', () => {
    beforeEach(async () => {
      await configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
    });

    it('shows only owned decks', () => {
      component.loading.set(false);
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll('.deck-tile:not(.deck-tile--add)');
      expect(tiles.length).toBe(1);
      expect(tiles[0].textContent).toContain('Adventure');
    });

    it('does not render a search box', () => {
      component.loading.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
    });

    it('renders the add tile when user is logged in', () => {
      component.loading.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-tile--add')).not.toBeNull();
    });
  });

  describe('search mode', () => {
    beforeEach(async () => {
      await configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
    });

    it('shows only public decks', () => {
      component.loading.set(false);
      fixture.detectChanges();
      const tiles = fixture.nativeElement.querySelectorAll('.deck-tile:not(.deck-tile--add)');
      expect(tiles.length).toBe(1);
      expect(tiles[0].textContent).toContain('Mystic Tarot');
    });

    it('renders a search box', () => {
      component.loading.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
    });

    it('filters public decks by search term', () => {
      component.loading.set(false);
      component.searchTerm.set('nomatch');
      fixture.detectChanges();
      expect(component.visibleDecks().length).toBe(0);
      component.searchTerm.set('mystic');
      expect(component.visibleDecks().length).toBe(1);
    });
  });

  describe('favourites', () => {
    it('shows a star on non-owned decks in search mode when logged in', async () => {
      await configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      component.loading.set(false);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-fav')).not.toBeNull();
    });

    it('toggleFavorite flips isFavorite and calls the service', async () => {
      await configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      component.loading.set(false);
      fixture.detectChanges();
      const svc = TestBed.inject(DeckService) as unknown as { addFavorite: ReturnType<typeof vi.fn> };
      const target = component.decks().find((d) => d.id === 2)!;
      component.toggleFavorite(target, new MouseEvent('click'));
      expect(component.decks().find((d) => d.id === 2)!.isFavorite).toBe(true);
      expect(svc.addFavorite).toHaveBeenCalledWith(2);
    });

    it('mine mode includes favourited non-owned decks', async () => {
      await configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      component.decks.set([
        { ...ownedDeck },
        { ...publicDeck, isFavorite: true },
      ]);
      component.loading.set(false);
      expect(component.visibleDecks().map((d) => d.id).sort()).toEqual([1, 2]);
    });
  });
});

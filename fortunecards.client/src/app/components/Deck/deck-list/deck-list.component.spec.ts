import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of, Subject } from 'rxjs';
import { DeckListComponent } from './deck-list.component';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck, PagedResult } from '../../../models/deck';

const ownedDeck: Deck = {
  id: 1, name: 'Adventure', description: null, createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 3, isPublic: false, isOwner: true, isFavorite: false,
};
const publicDeck: Deck = {
  id: 2, name: 'Mystic Tarot', description: 'ancient wisdom', createdAt: '2026-01-02', emoji: '🔮', colorIndex: 1,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, cardCount: 5, isPublic: true, isOwner: false, isFavorite: false,
};

function paged(items: Deck[], totalCount = items.length): PagedResult<Deck> {
  return { items, totalCount, page: 1, pageSize: 20 };
}

function configure(mode: 'mine' | 'search', loggedIn = true) {
  const mockDeckService = {
    getMyDecks: vi.fn(() => of([ownedDeck, { ...publicDeck, isFavorite: true }])),
    getPublicDecks: vi.fn(() => of(paged([publicDeck]))),
    addFavorite: vi.fn(() => of(void 0)),
    removeFavorite: vi.fn(() => of(void 0)),
  };
  TestBed.configureTestingModule({
    imports: [DeckListComponent, RouterModule.forRoot([]), NavigationBar],
    providers: [
      provideZonelessChangeDetection(),
      { provide: DeckService, useValue: mockDeckService },
      { provide: ActivatedRoute, useValue: { data: of({ mode }) } },
      { provide: AuthService, useValue: { isLoggedIn: signal(loggedIn), currentUser: signal(loggedIn ? { displayName: 'Test', email: 't@e.com' } : null) } },
    ],
  });
  return mockDeckService;
}

describe('DeckListComponent', () => {
  let component: DeckListComponent;
  let fixture: ComponentFixture<DeckListComponent>;

  describe('mine mode', () => {
    it('loads mine decks via getMyDecks and renders them', () => {
      const svc = configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(svc.getMyDecks).toHaveBeenCalled();
      expect(component.decks().map((d) => d.id).sort()).toEqual([1, 2]);
      expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
    });

    it('renders the add tile when logged in', () => {
      configure('mine');
      fixture = TestBed.createComponent(DeckListComponent);
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.deck-tile--add')).not.toBeNull();
    });
  });

  describe('search mode', () => {
    it('loads a public page and renders a search box', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      expect(svc.getPublicDecks).toHaveBeenCalledWith('', 1, 20);
      expect(component.decks().map((d) => d.id)).toEqual([2]);
      expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
    });

    it('overlays favourite state from getMyDecks onto public items', () => {
      configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      // deck 2 is favourited in the mine list, so the overlay marks it favourite
      expect(component.decks().find((d) => d.id === 2)!.isFavorite).toBe(true);
    });

    it('onPageChange reloads the requested page', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      svc.getPublicDecks.mockClear();
      component.onPageChange(3);
      expect(component.page()).toBe(3);
      expect(svc.getPublicDecks).toHaveBeenCalledWith('', 3, 20);
    });

    it('ignores a stale in-flight page response when a newer page is requested', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges(); // initial page load resolves

      const stale = new Subject<PagedResult<Deck>>();
      svc.getPublicDecks.mockReturnValueOnce(stale); // page 2 request hangs
      component.onPageChange(2);

      svc.getPublicDecks.mockReturnValueOnce(of(paged([{ ...publicDeck, id: 99, name: 'Fresh' }]))); // page 3 resolves
      component.onPageChange(3);
      expect(component.decks().map((d) => d.id)).toEqual([99]);

      // stale page-2 response arrives late — switchMap should have unsubscribed it
      stale.next(paged([{ ...publicDeck, id: 2, name: 'Stale' }]));
      stale.complete();
      expect(component.decks().map((d) => d.id)).toEqual([99]);
    });
  });

  describe('favourites', () => {
    it('toggleFavorite flips isFavorite and calls the service', () => {
      const svc = configure('search');
      fixture = TestBed.createComponent(DeckListComponent);
      component = fixture.componentInstance;
      fixture.detectChanges();
      const target = component.decks().find((d) => d.id === 2)!;
      const wasFav = target.isFavorite;
      component.toggleFavorite(target, new MouseEvent('click'));
      expect(component.decks().find((d) => d.id === 2)!.isFavorite).toBe(!wasFav);
      expect(wasFav ? svc.removeFavorite : svc.addFavorite).toHaveBeenCalledWith(2);
    });
  });
});

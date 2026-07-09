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
  cardBackImageUrl: null, cardCount: 3, isPublic: false, isOwner: true
};
const publicDeck: Deck = {
  id: 2, name: 'Mystic Tarot', description: 'ancient wisdom',
  createdAt: '2026-01-02', emoji: '🔮', colorIndex: 1,
  cardBackImageUrl: null, cardCount: 5, isPublic: true, isOwner: false
};

function configure(mode: 'mine' | 'search') {
  const mockDeckService = {
    getDecks: () => of([ownedDeck, publicDeck]),
    deleteDeck: () => of(void 0),
  };
  return TestBed.configureTestingModule({
    declarations: [DeckListComponent],
    imports: [CommonModule, RouterModule.forRoot([]), NavigationBar],
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
});

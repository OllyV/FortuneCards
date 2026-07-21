import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of, throwError } from 'rxjs';
import { DeckSelectorComponent } from './deck-selector.component';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck } from '../../../models/deck';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🔮',
    colorIndex: 0, cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

describe('DeckSelectorComponent', () => {
  let fixture: ComponentFixture<DeckSelectorComponent>;
  const decks = [
    deck({ id: 1, name: 'Mine', isOwner: true, isPublic: false }),
    deck({ id: 2, name: 'Public', isOwner: false, isPublic: true }),
    deck({ id: 3, name: 'Other', isOwner: false, isPublic: false }),
  ];
  const getDeck = vi.fn((id: number) => of(deck({ id, name: 'Full', isOwner: true })));

  function setup(loggedIn: boolean) {
    TestBed.configureTestingModule({
      imports: [DeckSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: { getDecks: () => of(decks), getDeck } },
        { provide: AuthService, useValue: { currentUser: signal(loggedIn ? { id: 1 } : null) } },
      ],
    });
    fixture = TestBed.createComponent(DeckSelectorComponent);
    fixture.detectChanges();
  }

  it('shows only owned decks when authorized', () => {
    setup(true);
    expect(fixture.componentInstance.visibleDecks().map((d) => d.id)).toEqual([1]);
    expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
  });

  it('shows public decks with a search box when not authorized', () => {
    setup(false);
    expect(fixture.componentInstance.visibleDecks().map((d) => d.id)).toEqual([2]);
    expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
    fixture.componentInstance.searchTerm.set('nomatch');
    expect(fixture.componentInstance.visibleDecks()).toEqual([]);
  });

  it('fetches the full deck and emits deckSelected + closed on pick', () => {
    setup(true);
    const selected = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.deckSelected.subscribe(selected);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.selectDeck(decks[0]);
    expect(getDeck).toHaveBeenCalledWith(1);
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Full' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('keeps the deck grid visible and sets selectError (not error) when getDeck fails', () => {
    setup(true);
    getDeck.mockReturnValueOnce(throwError(() => new Error('boom')));
    fixture.componentInstance.selectDeck(decks[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.deck-grid')).not.toBeNull();
    expect(fixture.componentInstance.selectError()).toBeTruthy();
    expect(fixture.componentInstance.error()).toBeNull();
  });
});

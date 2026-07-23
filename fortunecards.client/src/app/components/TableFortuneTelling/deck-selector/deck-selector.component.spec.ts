import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of, throwError, Subject } from 'rxjs';
import { DeckSelectorComponent } from './deck-selector.component';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { Deck, PagedResult } from '../../../models/deck';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

function paged(items: Deck[]): PagedResult<Deck> {
  return { items, totalCount: items.length, page: 1, pageSize: 12 };
}

describe('DeckSelectorComponent', () => {
  let fixture: ComponentFixture<DeckSelectorComponent>;
  const mine = [deck({ id: 1, name: 'Mine', isOwner: true }), deck({ id: 4, name: 'Fav', isFavorite: true, isPublic: true })];
  const publics = [deck({ id: 2, name: 'Public', isPublic: true }), deck({ id: 4, name: 'Fav', isPublic: true })];
  const getDeck = vi.fn((id: number) => of(deck({ id, name: 'Full', isOwner: true })));

  function setup(loggedIn: boolean) {
    const svc = {
      getMyDecks: vi.fn(() => of(mine)),
      getPublicDecks: vi.fn(() => of(paged(publics))),
      getDeck,
    };
    TestBed.configureTestingModule({
      imports: [DeckSelectorComponent],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: svc },
        { provide: AuthService, useValue: { currentUser: signal(loggedIn ? { id: 1 } : null) } },
      ],
    });
    fixture = TestBed.createComponent(DeckSelectorComponent);
    fixture.detectChanges();
    return svc;
  }

  it('shows the mine set via getMyDecks when authorized, no search box', () => {
    const svc = setup(true);
    expect(svc.getMyDecks).toHaveBeenCalled();
    expect(fixture.componentInstance.decks().map((d) => d.id).sort()).toEqual([1, 4]);
    expect(fixture.nativeElement.querySelector('.deck-search')).toBeNull();
  });

  it('shows public paged decks with a search box when not authorized', () => {
    const svc = setup(false);
    expect(svc.getPublicDecks).toHaveBeenCalledWith('', 1, 12);
    expect(fixture.componentInstance.decks().map((d) => d.id).sort()).toEqual([2, 4]);
    expect(fixture.nativeElement.querySelector('.deck-search')).not.toBeNull();
  });

  it('onPageChange reloads the requested public page', () => {
    const svc = setup(false);
    svc.getPublicDecks.mockClear();
    fixture.componentInstance.onPageChange(2);
    expect(svc.getPublicDecks).toHaveBeenCalledWith('', 2, 12);
  });

  it('fetches the full deck and emits deckSelected + closed on pick', () => {
    setup(true);
    const selected = vi.fn();
    const closed = vi.fn();
    fixture.componentInstance.deckSelected.subscribe(selected);
    fixture.componentInstance.closed.subscribe(closed);
    fixture.componentInstance.selectDeck(mine[0]);
    expect(getDeck).toHaveBeenCalledWith(1);
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: 1, name: 'Full' }));
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('keeps the grid visible and sets selectError (not error) when getDeck fails', () => {
    setup(true);
    getDeck.mockReturnValueOnce(throwError(() => new Error('boom')));
    fixture.componentInstance.selectDeck(mine[0]);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.deck-grid')).not.toBeNull();
    expect(fixture.componentInstance.selectError()).toBeTruthy();
    expect(fixture.componentInstance.error()).toBeNull();
  });

  it('ignores a stale in-flight page response when a newer page is requested', () => {
    const svc = setup(false);
    const stale = new Subject<PagedResult<Deck>>();
    svc.getPublicDecks.mockReturnValueOnce(stale);
    fixture.componentInstance.onPageChange(2);
    svc.getPublicDecks.mockReturnValueOnce(of(paged([deck({ id: 99, name: 'Fresh', isPublic: true })])));
    fixture.componentInstance.onPageChange(3);
    expect(fixture.componentInstance.decks().map((d) => d.id)).toEqual([99]);
    stale.next(paged([deck({ id: 2, name: 'Stale', isPublic: true })]));
    stale.complete();
    expect(fixture.componentInstance.decks().map((d) => d.id)).toEqual([99]);
  });
});

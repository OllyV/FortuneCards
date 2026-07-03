import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { DeckListComponent } from './deck-list.component';
import { NavigationBar } from '../navigation-bar/navigation-bar';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, cardCount: 3, isPublic: false, isOwner: false
};

describe('DeckListComponent', () => {
  let component: DeckListComponent;
  let fixture: ComponentFixture<DeckListComponent>;

  beforeEach(async () => {
    const mockDeckService = {
      getDecks: () => of([mockDeck]),
      deleteDeck: () => of(void 0),
    };

    await TestBed.configureTestingModule({
      declarations: [DeckListComponent],
      imports: [CommonModule, RouterModule.forRoot([]), NavigationBar],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckListComponent);
    component = fixture.componentInstance;
  });

  it('should render a deck tile for each deck', () => {
    component.decks.set([mockDeck]);
    component.loading.set(false);
    fixture.detectChanges();
    const tiles = fixture.nativeElement.querySelectorAll('.deck-tile:not(.deck-tile--add)');
    expect(tiles.length).toBe(1); // one tile per deck (the "add" tile is auth-gated)
  });

  it('should apply gradient style to deck tile', () => {
    component.decks.set([mockDeck]);
    component.loading.set(false);
    fixture.detectChanges();
    const tile = fixture.nativeElement.querySelector('.deck-tile:not(.deck-tile--add)');
    // colorIndex 0 → gradient from #B2FEFA, normalized to rgb() in the style attribute
    const styleAttr = tile.getAttribute('style') ?? '';
    expect(styleAttr).toContain('rgb(178, 254, 250)');
  });

  it('should display deck emoji and name', () => {
    component.decks.set([mockDeck]);
    component.loading.set(false);
    fixture.detectChanges();
    const tile = fixture.nativeElement.querySelector('.deck-tile:not(.deck-tile--add)');
    expect(tile.textContent).toContain('🌈');
    expect(tile.textContent).toContain('Adventure');
  });
});

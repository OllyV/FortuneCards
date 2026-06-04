import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { DeckListComponent } from './deck-list.component';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, cardCount: 3
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
      imports: [CommonModule, RouterModule.forRoot([])],
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
    const tiles = fixture.nativeElement.querySelectorAll('.deck-tile');
    expect(tiles.length).toBe(2); // 1 deck + 1 "add" tile
  });

  it('should apply gradient style to deck tile', () => {
    component.decks.set([mockDeck]);
    component.loading.set(false);
    fixture.detectChanges();
    const tile = fixture.nativeElement.querySelector('.deck-tile:not(.deck-tile--add)');
    // JSDOM normalizes hex colors to rgb(); check the raw style attribute instead
    const styleAttr = tile.getAttribute('style') ?? '';
    expect(styleAttr).toContain('#FF6B6B');
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

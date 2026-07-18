import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CardDetailComponent } from './card-detail.component';
import { DeckService } from '../../../services/deck.service';
import { Deck } from '../../../models/deck';

const deckWithCard: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: true, isOwner: true,
  cards: [{ id: 5, title: 'The Star', description: 'Hope and renewal', imageUrl: '/images/x.png', createdAt: '2026-01-01', deckId: 1 }],
};

describe('CardDetailComponent', () => {
  let component: CardDetailComponent;
  let fixture: ComponentFixture<CardDetailComponent>;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(deckWithCard) };
    await TestBed.configureTestingModule({
      imports: [CardDetailComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1', cardId: '5' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should load and display the card title and description', () => {
    expect(component.card()?.title).toBe('The Star');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('The Star');
    expect(text).toContain('Hope and renewal');
  });

  it('should expose isOwner from the loaded deck', () => {
    expect(component.isOwner()).toBe(true);
  });
});

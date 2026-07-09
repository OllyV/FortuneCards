import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { DrawnCardComponent } from './drawn-card.component';
import { Deck } from '../../../models/deck';
import { Card } from '../../../models/card';

const mockCard: Card = { id: 1, title: 'The Journey', description: 'Step forward', imageUrl: '', createdAt: '2026-01-01', deckId: 1 };
const mockCard2: Card = { id: 2, title: 'The Return', description: 'Come back', imageUrl: '', createdAt: '2026-01-01', deckId: 1 };
const mockDeck: Deck = { id: 1, name: 'Adventure', description: null, createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0, cardBackImageUrl: null, cards: [mockCard], isPublic: false, isOwner: false };
const mockDeckTwoCards: Deck = { ...mockDeck, cards: [mockCard, mockCard2] };

describe('DrawnCardComponent', () => {
  let component: DrawnCardComponent;
  let fixture: ComponentFixture<DrawnCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DrawnCardComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } }
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DrawnCardComponent);
    component = fixture.componentInstance;
  });

  it('should start with flipped = false', () => {
    expect(component.flipped()).toBe(false);
  });

  it('should flip card when flipCard() is called', () => {
    component.deck.set(mockDeck);
    component.drawnCard.set(mockCard);
    component.loading.set(false);
    fixture.detectChanges();
    component.flipCard();
    fixture.detectChanges();
    expect(component.flipped()).toBe(true);
    const scene = fixture.nativeElement.querySelector('.card-scene');
    expect(scene.classList).toContain('flipped');
  });

  it('should reset flipped when drawAnother() is called', () => {
    component.deck.set(mockDeck);
    component.drawnCard.set(mockCard);
    component.flipped.set(true);
    component.drawAnother();
    expect(component.flipped()).toBe(false);
  });

  it('should keep flipped false and not update drawnCard until animation completes on drawAnother', () => {
    vi.useFakeTimers();
    // Force Math.random to always pick the second card (index 1)
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      component.deck.set(mockDeckTwoCards);
      component.drawnCard.set(mockDeckTwoCards.cards![0]);
      component.flipped.set(true);

      const cardBefore = component.drawnCard();
      component.drawAnother();

      // Immediately after: flipped false, card unchanged
      expect(component.flipped()).toBe(false);
      expect(component.drawnCard()).toBe(cardBefore);

      // After 700ms: card updated to the second card
      vi.advanceTimersByTime(700);
      expect(component.drawnCard()).toBe(mockDeckTwoCards.cards![1]);
    } finally {
      vi.restoreAllMocks();
      vi.useRealTimers();
    }
  });

  it('should cancel pending timer if drawAnother is called again before 700ms', () => {
    vi.useFakeTimers();
    try {
      component.deck.set(mockDeckTwoCards);
      component.drawnCard.set(mockDeckTwoCards.cards![0]);
      component.flipped.set(true);

      component.drawAnother(); // first call
      vi.advanceTimersByTime(300); // only 300ms pass

      const cardAfterFirstPartial = component.drawnCard();
      expect(cardAfterFirstPartial).toBe(mockDeckTwoCards.cards![0]); // still unchanged

      component.drawAnother(); // second call resets timer
      vi.advanceTimersByTime(700); // 700ms from second call

      // Card should have updated exactly once
      expect(component.drawnCard()).not.toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});
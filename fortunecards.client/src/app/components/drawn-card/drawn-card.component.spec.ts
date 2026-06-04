import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DrawnCardComponent } from './drawn-card.component';
import { Deck } from '../../models/deck';
import { Card } from '../../models/card';

const mockCard: Card = { id: 1, title: 'The Journey', description: 'Step forward', imageUrl: '', createdAt: '2026-01-01', deckId: 1 };
const mockDeck: Deck = { id: 1, name: 'Adventure', description: null, createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0, cardBackImageUrl: null, cards: [mockCard] };

describe('DrawnCardComponent', () => {
  let component: DrawnCardComponent;
  let fixture: ComponentFixture<DrawnCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DrawnCardComponent],
      imports: [RouterModule.forRoot([])],
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
});

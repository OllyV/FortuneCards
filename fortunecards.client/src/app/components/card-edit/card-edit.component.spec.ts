import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { CardEditComponent } from './card-edit.component';
import { DeckService } from '../../services/deck.service';
import { Deck } from '../../models/deck';

const deckWithCard: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, isPublic: true, isOwner: true,
  cards: [{ id: 5, title: 'The Star', description: 'Hope', imageUrl: '/images/x.png', createdAt: '2026-01-01', deckId: 1 }],
};

const nonOwnerDeckWithCard: Deck = {
  id: 1, name: 'Adventure', description: null,
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, isPublic: true, isOwner: false,
  cards: [{ id: 5, title: 'The Star', description: 'Hope', imageUrl: '/images/x.png', createdAt: '2026-01-01', deckId: 1 }],
};

describe('CardEditComponent', () => {
  let component: CardEditComponent;
  let fixture: ComponentFixture<CardEditComponent>;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(deckWithCard) };
    await TestBed.configureTestingModule({
      imports: [CardEditComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1', cardId: '5' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should prefill the form from the loaded card', () => {
    expect(component.form.get('title')!.value).toBe('The Star');
    expect(component.form.get('description')!.value).toBe('Hope');
    expect(component.currentImageUrl()).toBe('/images/x.png');
  });

  it('should be invalid when title is cleared', () => {
    component.form.get('title')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });
});

describe('CardEditComponent (non-owner)', () => {
  let fixture: ComponentFixture<CardEditComponent>;
  let router: Router;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(nonOwnerDeckWithCard) };
    await TestBed.configureTestingModule({
      imports: [CardEditComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1', cardId: '5' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardEditComponent);
    router = TestBed.inject(Router);
  });

  it('should redirect a non-owner to the card detail page', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/decks', 1, 'cards', 5]);
  });
});

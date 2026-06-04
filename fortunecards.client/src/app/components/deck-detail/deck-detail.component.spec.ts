import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { DeckDetailComponent } from './deck-detail.component';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: 'Bold quests',
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, cards: []
};

describe('DeckDetailComponent', () => {
  let component: DeckDetailComponent;
  let fixture: ComponentFixture<DeckDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DeckDetailComponent],
      imports: [RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } }
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckDetailComponent);
    component = fixture.componentInstance;
  });

  it('should render the deck hero banner with emoji and name', () => {
    component.deck.set(mockDeck);
    component.loading.set(false);
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.deck-hero');
    expect(hero.textContent).toContain('🌈');
    expect(hero.textContent).toContain('Adventure');
  });

  it('should apply gradient to hero banner', () => {
    component.deck.set(mockDeck);
    component.loading.set(false);
    fixture.detectChanges();
    const hero = fixture.nativeElement.querySelector('.deck-hero');
    // Browsers normalize hex colors to rgb() in style attributes
    const style = hero.getAttribute('style') ?? '';
    const hasHex = style.includes('#FF6B6B');
    const hasRgb = style.includes('rgb(255, 107, 107)');
    expect(hasHex || hasRgb).toBe(true);
  });
});

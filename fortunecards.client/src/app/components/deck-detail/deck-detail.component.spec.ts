import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { CommonModule, Location } from '@angular/common';
import { DeckDetailComponent } from './deck-detail.component';
import { NavigationBar } from '../navigation-bar/navigation-bar';
import { Deck } from '../../models/deck';

const mockDeck: Deck = {
  id: 1, name: 'Adventure', description: 'Bold quests',
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 0,
  cardBackImageUrl: null, cards: [], isPublic: false, isOwner: false
};

describe('DeckDetailComponent', () => {
  let component: DeckDetailComponent;
  let fixture: ComponentFixture<DeckDetailComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [DeckDetailComponent],
      imports: [CommonModule, RouterModule.forRoot([]), NavigationBar],
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
    // colorIndex 0 → gradient from #B2FEFA; browsers normalize hex to rgb() in style attributes
    const hasHex = style.includes('#B2FEFA');
    const hasRgb = style.includes('rgb(178, 254, 250)');
    expect(hasHex || hasRgb).toBe(true);
  });

  it('goBack() returns to the previous page via Location.back()', () => {
    const location = TestBed.inject(Location);
    const backSpy = vi.spyOn(location, 'back').mockImplementation(() => {});
    component.goBack();
    expect(backSpy).toHaveBeenCalledTimes(1);
  });
});

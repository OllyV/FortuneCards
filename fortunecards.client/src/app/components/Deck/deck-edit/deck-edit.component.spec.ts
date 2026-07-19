import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ReactiveFormsModule } from '@angular/forms';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule, ActivatedRoute, Router } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { DeckEditComponent } from './deck-edit.component';
import { DeckService } from '../../../services/deck.service';
import { Deck } from '../../../models/deck';

const ownerDeck: Deck = {
  id: 1, name: 'Adventure', description: 'Bold quests',
  createdAt: '2026-01-01', emoji: '🌈', colorIndex: 3,
  cardBackImageUrl: null, aspectWidth: 4, aspectHeight: 9, isPublic: true, isOwner: true,
};

const nonOwnerDeck: Deck = { ...ownerDeck, isOwner: false };

describe('DeckEditComponent', () => {
  let component: DeckEditComponent;
  let fixture: ComponentFixture<DeckEditComponent>;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(ownerDeck) };
    await TestBed.configureTestingModule({
      imports: [DeckEditComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckEditComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should prefill the form from the loaded deck', () => {
    expect(component.form.get('name')!.value).toBe('Adventure');
    expect(component.form.get('colorIndex')!.value).toBe(3);
    expect(component.form.get('isPublic')!.value).toBe(true);
  });

  it('should be invalid when name is cleared', () => {
    component.form.get('name')!.setValue('');
    expect(component.form.invalid).toBe(true);
  });

  it('patches the aspect ratio from the loaded deck', () => {
    // ownerDeck is returned by the mock getDeck used in this suite's owner test
    expect(component.form.get('aspectWidth')!.value).toBe(4);
    expect(component.form.get('aspectHeight')!.value).toBe(9);
  });
});

describe('DeckEditComponent (non-owner)', () => {
  let fixture: ComponentFixture<DeckEditComponent>;
  let router: Router;

  beforeEach(async () => {
    const mockDeckService = { getDeck: () => of(nonOwnerDeck) };
    await TestBed.configureTestingModule({
      imports: [DeckEditComponent, ReactiveFormsModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: DeckService, useValue: mockDeckService },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(DeckEditComponent);
    router = TestBed.inject(Router);
  });

  it('should redirect a non-owner to the deck detail page', () => {
    const navigateSpy = vi.spyOn(router, 'navigate');
    fixture.detectChanges();
    expect(navigateSpy).toHaveBeenCalledWith(['/decks', 1]);
  });
});

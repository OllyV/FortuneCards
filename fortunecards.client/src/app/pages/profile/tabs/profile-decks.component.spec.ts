import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of, throwError } from 'rxjs';
import { ProfileDecksComponent } from './profile-decks.component';
import { DeckService } from '../../../services/deck.service';
import { Deck } from '../../../models/deck';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🎴', colorIndex: 0,
    cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

function render(svc: Partial<DeckService>) {
  TestBed.configureTestingModule({
    imports: [ProfileDecksComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [provideZonelessChangeDetection(), { provide: DeckService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(ProfileDecksComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfileDecksComponent', () => {
  it('keeps only owned decks and renders a card each plus the add-tile', () => {
    const fixture = render({
      getMyDecks: vi.fn(() => of([deck({ id: 1, isOwner: true }), deck({ id: 2, isFavorite: true })])),
    });
    expect(fixture.componentInstance.decks().map((d) => d.id)).toEqual([1]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.card').length).toBe(1);
    expect(el.querySelector('.add')).not.toBeNull();
  });

  it('shows an error state when loading fails', () => {
    const fixture = render({ getMyDecks: vi.fn(() => throwError(() => new Error('x'))) });
    expect(fixture.componentInstance.error()).not.toBeNull();
    expect((fixture.nativeElement as HTMLElement).querySelector('.state.error')).not.toBeNull();
  });
});

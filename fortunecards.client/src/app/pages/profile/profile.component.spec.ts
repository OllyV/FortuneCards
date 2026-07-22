import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';
import { DeckService } from '../../services/deck.service';
import { AuthService } from '../../services/auth.service';
import { Deck } from '../../models/deck';

function deck(over: Partial<Deck>): Deck {
  return {
    id: 1, name: 'D', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    cardBackImageUrl: null, aspectWidth: 3, aspectHeight: 5, isPublic: false, isOwner: false, isFavorite: false, ...over,
  };
}

describe('ProfileComponent', () => {
  let fixture: ComponentFixture<ProfileComponent>;

  it('shows only owned decks from getMyDecks', () => {
    const svc = {
      getMyDecks: vi.fn(() => of([deck({ id: 1, isOwner: true }), deck({ id: 2, isFavorite: true, isPublic: true })])),
    };
    TestBed.configureTestingModule({
      imports: [ProfileComponent, RouterModule.forRoot([]), NavigationBar],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: svc },
        { provide: AuthService, useValue: { isLoggedIn: signal(true), currentUser: signal({ displayName: 'Test', email: 't@e.com' }) } },
      ],
    });
    fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    expect(svc.getMyDecks).toHaveBeenCalled();
    expect(fixture.componentInstance.decks().map((d) => d.id)).toEqual([1]);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfileComponent } from './profile.component';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';
import { DeckService } from '../../services/deck.service';
import { AuthService } from '../../services/auth.service';
import { Deck } from '../../models/deck';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing';

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
      imports: [ProfileComponent, RouterModule.forRoot([]), NavigationBar, getTranslocoTestingModule()],
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

  function renderWithUser(user: any) {
    const svc = { getMyDecks: vi.fn(() => of([])) };
    TestBed.configureTestingModule({
      imports: [ProfileComponent, RouterModule.forRoot([]), NavigationBar, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: DeckService, useValue: svc },
        { provide: AuthService, useValue: { isLoggedIn: signal(true), currentUser: signal(user) } },
      ],
    });
    const fixture = TestBed.createComponent(ProfileComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders the avatar image when avatarUrl is set', () => {
    const el = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: null, avatarUrl: 'https://img/x.png' });
    const img = el.querySelector('.profile-avatar-img') as HTMLImageElement | null;
    expect(img).not.toBeNull();
    expect(img!.src).toContain('https://img/x.png');
  });

  it('shows the nickname over the display name', () => {
    const el = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: 'Nick', avatarUrl: null });
    expect(el.querySelector('h1')!.textContent).toContain('Nick');
    expect(el.querySelector('.profile-avatar-img')).toBeNull(); // letter fallback
  });
});

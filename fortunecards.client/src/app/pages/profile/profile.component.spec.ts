import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { ProfileComponent } from './profile.component';
import { AuthService } from '../../services/auth.service';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing';

function renderWithUser(user: any) {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({
    imports: [ProfileComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [
      provideZonelessChangeDetection(),
      { provide: AuthService, useValue: { isLoggedIn: signal(true), currentUser: signal(user) } },
    ],
  });
  const fixture = TestBed.createComponent(ProfileComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ProfileComponent (shell)', () => {
  it('renders the header, four tab links and a router outlet', () => {
    const el = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: 'Nick', avatarUrl: null });
    expect(el.querySelector('h1')!.textContent).toContain('Nick');
    expect(el.querySelector('.profile-email')!.textContent).toContain('t@e.com');
    expect(el.querySelectorAll('.tab').length).toBe(4);
    expect(el.querySelector('router-outlet')).not.toBeNull();
  });

  it('renders the avatar image when avatarUrl is set, else the letter fallback', () => {
    const withImg = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: null, avatarUrl: 'https://img/x.png' });
    expect((withImg.querySelector('.profile-avatar-img') as HTMLImageElement | null)?.src).toContain('https://img/x.png');
    const withLetter = renderWithUser({ displayName: 'Goog', email: 't@e.com', nickname: 'Nick', avatarUrl: null });
    expect(withLetter.querySelector('.profile-avatar-img')).toBeNull();
    expect(withLetter.querySelector('.profile-avatar')!.textContent).toContain('N');
  });
});

import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { AccountSettingsComponent } from './account-settings.component';
import { AuthService } from '../../services/auth.service';
import { getTranslocoTestingModule } from '../../../testing/transloco-testing';

function setup(patchImpl: (...args: any[]) => any) {
  const http = { patch: vi.fn(patchImpl), delete: vi.fn(() => of({})) };
  const loadCurrentUser = vi.fn(() => Promise.resolve());
  const auth = {
    currentUser: signal({ id: 1, email: 'a@b.com', displayName: 'Goog', nickname: 'Nick', avatarUrl: null }),
    isLoggedIn: () => true,
    loadCurrentUser,
    logout: vi.fn(() => Promise.resolve()),
  };
  TestBed.configureTestingModule({
    imports: [AccountSettingsComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [
      provideZonelessChangeDetection(),
      { provide: HttpClient, useValue: http },
      { provide: AuthService, useValue: auth },
    ],
  });
  const fixture = TestBed.createComponent(AccountSettingsComponent);
  fixture.detectChanges();
  return { comp: fixture.componentInstance, http, loadCurrentUser };
}

describe('AccountSettingsComponent', () => {
  it('seeds nickname from the current user', () => {
    const { comp } = setup(() => of({}));
    expect(comp.nickname()).toBe('Nick');
  });

  it('save() posts FormData and refreshes the current user', async () => {
    const { comp, http, loadCurrentUser } = setup(() => of({ id: 1, nickname: 'New' }));
    comp.nickname.set('New');
    comp.save();
    await new Promise((r) => setTimeout(r));

    expect(http.patch).toHaveBeenCalledWith('/api/auth/profile', expect.any(FormData));
    const form = http.patch.mock.calls[0][1] as FormData;
    expect(form.get('Nickname')).toBe('New');
    expect(loadCurrentUser).toHaveBeenCalled();
    expect(comp.saveSuccess()).toBe(true);
    expect(comp.saving()).toBe(false);
  });

  it('save() surfaces an error on failure', async () => {
    const { comp } = setup(() => throwError(() => new Error('boom')));
    comp.save();
    await new Promise((r) => setTimeout(r));

    expect(comp.saveError()).toBeTruthy();
    expect(comp.saving()).toBe(false);
  });
});

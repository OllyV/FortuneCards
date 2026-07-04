import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { RouterModule } from '@angular/router';
import { landingRedirectGuard } from './landing-redirect.guard';
import { AuthService } from '../services/auth.service';

describe('landingRedirectGuard', () => {
  function setup(loggedIn: boolean) {
    const auth = { isLoggedIn: signal(loggedIn) };
    TestBed.configureTestingModule({
      imports: [RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: auth },
      ],
    });
    const router = TestBed.inject(Router);
    const result = TestBed.runInInjectionContext(
      () => landingRedirectGuard(null as any, null as any)
    ) as UrlTree;
    return { router, result };
  }

  it('redirects logged-in users to /decks/mine', () => {
    const { router, result } = setup(true);
    expect(result.toString()).toBe(router.parseUrl('/decks/mine').toString());
  });

  it('redirects anonymous users to /decks/search', () => {
    const { router, result } = setup(false);
    expect(result.toString()).toBe(router.parseUrl('/decks/search').toString());
  });
});

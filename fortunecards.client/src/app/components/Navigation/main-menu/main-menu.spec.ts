import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { MainMenuComponent } from './main-menu';
import { AuthService } from '../../../services/auth.service';

describe('MainMenuComponent', () => {
  let component: MainMenuComponent;
  let fixture: ComponentFixture<MainMenuComponent>;
  let auth: {
    isLoggedIn: ReturnType<typeof signal<boolean>>;
    login: ReturnType<typeof vi.fn>;
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    auth = {
      isLoggedIn: signal(false),
      login: vi.fn(),
      logout: vi.fn().mockResolvedValue(undefined),
    };
    await TestBed.configureTestingModule({
      imports: [MainMenuComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: auth },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(MainMenuComponent);
    component = fixture.componentInstance;
  });

  function itemLabels(): string[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.menu-item'))
      .map((el) => (el as HTMLElement).textContent!.trim());
  }

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('toggle() opens the panel', () => {
    expect(fixture.nativeElement.querySelector('.menu-panel')).toBeNull();
    component.toggle();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.menu-panel')).not.toBeNull();
  });

  it('shows Search decks and Sign in when logged out', () => {
    component.open.set(true);
    fixture.detectChanges();
    expect(itemLabels()).toEqual(['Search decks', 'Table', 'Sign in with Google']);
  });

  it('shows all nav items and Logout when logged in', () => {
    auth.isLoggedIn.set(true);
    component.open.set(true);
    fixture.detectChanges();
    expect(itemLabels()).toEqual(['My decks', 'Search decks', 'Table', 'My profile', 'Logout']);
  });

  it('go() navigates and closes the panel', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.open.set(true);
    component.go('/decks/search');
    expect(navSpy).toHaveBeenCalledWith(['/decks/search']);
    expect(component.open()).toBe(false);
  });

  it('close() hides the panel', () => {
    component.open.set(true);
    fixture.detectChanges();
    component.close();
    fixture.detectChanges();
    expect(component.open()).toBe(false);
    expect(fixture.nativeElement.querySelector('.menu-panel')).toBeNull();
  });

  it('clicking .menu-backdrop closes the panel without navigating', () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.open.set(true);
    fixture.detectChanges();
    fixture.nativeElement.querySelector('.menu-backdrop').click();
    fixture.detectChanges();
    expect(component.open()).toBe(false);
    expect(navSpy).not.toHaveBeenCalled();
  });

  it('login() triggers auth.login and closes the panel', () => {
    component.open.set(true);
    component.login();
    expect(auth.login).toHaveBeenCalledTimes(1);
    expect(component.open()).toBe(false);
  });

  it('logout() logs out, navigates to /decks/search, and closes the panel', async () => {
    const router = TestBed.inject(Router);
    const navSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);
    component.open.set(true);
    await component.logout();
    expect(auth.logout).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith(['/decks/search']);
    expect(component.open()).toBe(false);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { LanguageSwitcherComponent } from './language-switcher';
import { LanguageService, LANGUAGES } from '../../../services/language.service';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('LanguageSwitcherComponent', () => {
  let fixture: ComponentFixture<LanguageSwitcherComponent>;
  let setLanguage: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    setLanguage = vi.fn();
    await TestBed.configureTestingModule({
      imports: [LanguageSwitcherComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: LanguageService, useValue: { current: () => 'en', setLanguage, LANGUAGES } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(LanguageSwitcherComponent);
    fixture.detectChanges();
  });

  function trigger(): HTMLButtonElement {
    return fixture.nativeElement.querySelector('.lang-trigger') as HTMLButtonElement;
  }

  function options(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.lang-option'));
  }

  function expand(): void {
    trigger().click();
    fixture.detectChanges();
  }

  it('renders a "Select language" trigger showing the current language, with options hidden', () => {
    expect(trigger()).toBeTruthy();
    expect(trigger().textContent).toContain('Select language');
    expect(trigger().textContent).toContain('English');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(options().length).toBe(0);
  });

  it('expands to one option per supported language when the trigger is clicked', () => {
    expand();
    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(options().length).toBe(LANGUAGES.length);
  });

  it('marks the active language once expanded', () => {
    expand();
    const active = fixture.nativeElement.querySelector('.lang-option.active');
    expect(active!.textContent).toContain('English');
    expect(active!.getAttribute('aria-current')).toBe('true');
  });

  it('calls setLanguage on option click and collapses the submenu', () => {
    expand();
    options().find((b) => b.textContent!.includes('Español'))!.click();
    fixture.detectChanges();
    expect(setLanguage).toHaveBeenCalledWith('es');
    expect(options().length).toBe(0);
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
  });

  it('toggles closed when the trigger is clicked again', () => {
    expand();
    expect(options().length).toBe(LANGUAGES.length);
    trigger().click();
    fixture.detectChanges();
    expect(options().length).toBe(0);
  });
});

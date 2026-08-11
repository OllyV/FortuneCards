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

  it('renders one option per supported language', () => {
    const options = fixture.nativeElement.querySelectorAll('.lang-option');
    expect(options.length).toBe(LANGUAGES.length);
  });

  it('marks the active language', () => {
    const active = fixture.nativeElement.querySelector('.lang-option.active');
    expect(active!.textContent).toContain('English');
    expect(active!.getAttribute('aria-current')).toBe('true');
  });

  it('calls setLanguage on click', () => {
    const options = Array.from(
      fixture.nativeElement.querySelectorAll('.lang-option'),
    ) as HTMLButtonElement[];
    options.find((b) => b.textContent!.includes('Español'))!.click();
    expect(setLanguage).toHaveBeenCalledWith('es');
  });
});

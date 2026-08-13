import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TranslocoService, provideTransloco } from '@jsverse/transloco';
import { of, throwError } from 'rxjs';
import { LanguageService, LANGUAGES, STORAGE_KEY } from './language.service';

class StubLoader {
  getTranslation() {
    return of({});
  }
}

class FailingLoader {
  getTranslation() {
    return throwError(() => new Error('offline'));
  }
}

function configure(loader: typeof StubLoader | typeof FailingLoader = StubLoader): LanguageService {
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideTransloco({
        config: {
          availableLangs: LANGUAGES.map((l) => l.code),
          defaultLang: 'en',
          fallbackLang: 'en',
        },
        loader,
      }),
    ],
  });
  return TestBed.inject(LanguageService);
}

describe('LanguageService', () => {
  beforeEach(() => localStorage.clear());

  it('exposes the 7 supported languages with native names', () => {
    expect(LANGUAGES.map((l) => l.code)).toEqual(['en', 'uk', 'ru', 'es', 'de', 'fr', 'pt']);
    expect(LANGUAGES.find((l) => l.code === 'uk')!.nativeName).toBe('Українська');
  });

  it('uses the persisted language when present', async () => {
    localStorage.setItem(STORAGE_KEY, 'de');
    const svc = configure();
    await svc.init();
    expect(svc.current()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });

  it('falls back through browser language to en', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('fr-FR');
    const svc = configure();
    await svc.init();
    expect(svc.current()).toBe('fr');
  });

  it('defaults to en for an unsupported browser language', async () => {
    vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');
    const svc = configure();
    await svc.init();
    expect(svc.current()).toBe('en');
  });

  it('setLanguage persists and updates active lang + html lang', async () => {
    const svc = configure();
    await svc.init();
    svc.setLanguage('es');
    expect(svc.current()).toBe('es');
    expect(localStorage.getItem(STORAGE_KEY)).toBe('es');
    expect(document.documentElement.lang).toBe('es');
    expect(TestBed.inject(TranslocoService).getActiveLang()).toBe('es');
  });

  it('init() resolves and still applies the language when the loader fails', async () => {
    localStorage.setItem(STORAGE_KEY, 'de');
    const svc = configure(FailingLoader);
    await expect(svc.init()).resolves.toBeUndefined();
    expect(svc.current()).toBe('de');
    expect(document.documentElement.lang).toBe('de');
  });
});

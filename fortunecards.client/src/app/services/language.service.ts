import { inject, Injectable, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

export const STORAGE_KEY = 'fc.lang';

export const LANGUAGES: readonly { code: string; nativeName: string }[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'uk', nativeName: 'Українська' },
  { code: 'ru', nativeName: 'Русский' },
  { code: 'es', nativeName: 'Español' },
  { code: 'de', nativeName: 'Deutsch' },
  { code: 'fr', nativeName: 'Français' },
  { code: 'pt', nativeName: 'Português' },
];

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);
  private readonly _current = signal(this.transloco.getDefaultLang());
  readonly current = this._current.asReadonly();

  async init(): Promise<void> {
    const lang = this.resolveInitialLang();
    await firstValueFrom(this.transloco.load(lang));
    this.apply(lang);
  }

  setLanguage(code: string): void {
    if (!LANGUAGES.some((l) => l.code === code)) {
      return;
    }
    localStorage.setItem(STORAGE_KEY, code);
    this.apply(code);
  }

  private apply(code: string): void {
    this.transloco.setActiveLang(code);
    this._current.set(code);
    document.documentElement.lang = code;
  }

  private resolveInitialLang(): string {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && LANGUAGES.some((l) => l.code === stored)) {
      return stored;
    }
    const browser = (navigator.language || 'en').slice(0, 2).toLowerCase();
    return LANGUAGES.some((l) => l.code === browser) ? browser : 'en';
  }
}

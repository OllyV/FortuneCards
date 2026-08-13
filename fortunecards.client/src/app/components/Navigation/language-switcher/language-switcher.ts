import { Component, computed, inject, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { LanguageService, LANGUAGES } from '../../../services/language.service';

@Component({
  selector: 'language-switcher',
  standalone: true,
  imports: [TranslocoDirective],
  templateUrl: './language-switcher.html',
  styleUrl: './language-switcher.css',
})
export class LanguageSwitcherComponent {
  private readonly language = inject(LanguageService);
  protected readonly languages = LANGUAGES;
  protected readonly current = this.language.current;
  protected readonly expanded = signal(false);
  protected readonly currentNativeName = computed(
    () => LANGUAGES.find((l) => l.code === this.current())?.nativeName ?? '',
  );

  toggle(): void {
    this.expanded.update((v) => !v);
  }

  select(code: string): void {
    this.language.setLanguage(code);
    this.expanded.set(false);
  }
}

import { Component, inject } from '@angular/core';
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

  select(code: string): void {
    this.language.setLanguage(code);
  }
}

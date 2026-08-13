import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TranslocoDirective, TranslocoPipe } from '@jsverse/transloco';
import { AuthService } from '../../../services/auth.service';
import { LanguageSwitcherComponent } from '../language-switcher/language-switcher';

@Component({
  selector: 'main-menu',
  standalone: true,
  templateUrl: './main-menu.html',
  styleUrl: './main-menu.css',
  imports: [TranslocoDirective, TranslocoPipe, LanguageSwitcherComponent],
})
export class MainMenuComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly open = signal(false);

  toggle(): void {
    this.open.update((v) => !v);
  }

  close(): void {
    this.open.set(false);
  }

  go(path: string): void {
    this.close();
    this.router.navigate([path]);
  }

  login(): void {
    this.close();
    this.auth.login();
  }

  logout(): Promise<void> {
    this.close();
    return this.auth.logout().then(() => {
      this.router.navigate(['/decks/search']);
    });
  }
}

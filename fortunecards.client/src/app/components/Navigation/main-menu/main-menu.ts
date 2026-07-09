import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'main-menu',
  standalone: true,
  templateUrl: './main-menu.html',
  styleUrl: './main-menu.css',
  imports: [],
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

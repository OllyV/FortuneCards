import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { MainMenuComponent } from '../main-menu/main-menu';

@Component({
  selector: 'navigation-bar',
  standalone: true,
  templateUrl: './navigation-bar.html',
  styleUrl: './navigation-bar.css',
  imports: [CommonModule, MainMenuComponent],
})
export class NavigationBar {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  goHome(): void {
    this.router.navigate(['/decks']);
  }

  goToProfile(): void {
    this.router.navigate(['/profile']);
  }

  login(): void {
    this.auth.login();
  }

  logout(): void {
    this.auth.logout().then(() => this.router.navigate(['/decks']));
  }
}

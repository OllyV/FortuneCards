import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../../services/auth.service';
import { NavigationBar } from '../../components/navigation-bar/navigation-bar';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
  imports: [CommonModule, FormsModule, NavigationBar],
})
export class AccountSettingsComponent {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  displayName = signal(this.auth.currentUser()?.displayName ?? '');
  saving = signal(false);
  saveSuccess = signal(false);
  saveError = signal<string | null>(null);
  deleting = signal(false);

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  deleteAccount(): void {
    if (!confirm('Delete your account? This removes all private decks. Public decks are kept as community decks. This cannot be undone.')) return;
    this.deleting.set(true);
    this.http.delete('/api/auth/account')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.auth.logout().then(() => this.router.navigate(['/decks']));
        },
        error: () => {
          this.deleting.set(false);
          alert('Failed to delete account. Please try again.');
        }
      });
  }
}

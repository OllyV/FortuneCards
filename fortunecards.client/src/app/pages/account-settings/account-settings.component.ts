import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { UserDto } from '../../models/user';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  templateUrl: './account-settings.component.html',
  styleUrls: ['./account-settings.component.css'],
  imports: [CommonModule, FormsModule, NavigationBar, TranslocoDirective],
})
export class AccountSettingsComponent {
  protected readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  nickname = signal(this.auth.currentUser()?.nickname ?? '');
  photoFile = signal<File | null>(null);
  photoPreview = signal<string | null>(this.auth.currentUser()?.avatarUrl ?? null);
  saving = signal(false);
  saveSuccess = signal(false);
  saveError = signal<string | null>(null);
  deleting = signal(false);

  private lastObjectUrl: string | null = null;

  onPhotoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0] ?? null;
    this.photoFile.set(file);
    if (file) {
      if (this.lastObjectUrl) URL.revokeObjectURL(this.lastObjectUrl);
      const url = URL.createObjectURL(file);
      this.photoPreview.set(url);
      this.lastObjectUrl = url;
    }
  }

  save(): void {
    this.saving.set(true);
    this.saveSuccess.set(false);
    this.saveError.set(null);

    const form = new FormData();
    form.append('Nickname', this.nickname().trim());
    const file = this.photoFile();
    if (file) form.append('Photo', file);

    this.http.patch<UserDto>('/api/auth/profile', form)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: async () => {
          await this.auth.loadCurrentUser();
          if (this.lastObjectUrl) {
            URL.revokeObjectURL(this.lastObjectUrl);
            this.lastObjectUrl = null;
          }
          this.photoPreview.set(this.auth.currentUser()?.avatarUrl ?? null);
          this.photoFile.set(null);
          this.saving.set(false);
          this.saveSuccess.set(true);
        },
        error: () => {
          this.saving.set(false);
          this.saveError.set(this.transloco.translate('errors.saveFailed'));
        },
      });
  }

  goBack(): void {
    this.router.navigate(['/profile']);
  }

  deleteAccount(): void {
    if (!confirm(this.transloco.translate('pages.accountDeleteConfirm'))) return;
    this.deleting.set(true);
    this.http.delete('/api/auth/account')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.auth.logout().then(() => this.router.navigate(['/decks']));
        },
        error: () => {
          this.deleting.set(false);
          alert(this.transloco.translate('errors.accountDeleteFailed'));
        }
      });
  }
}

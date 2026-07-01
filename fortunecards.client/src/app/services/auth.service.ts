import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UserDto } from '../models/user';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly currentUserSignal = signal<UserDto | null>(null);

  readonly currentUser = this.currentUserSignal.asReadonly();
  readonly isLoggedIn = computed(() => this.currentUserSignal() !== null);

  constructor(private http: HttpClient) {}

  login(): void {
    this.http.get<{ url: string }>('/api/auth/google/login').subscribe({
      next: ({ url }) => window.location.href = url,
      error: () => console.error('Failed to get OAuth URL')
    });
  }

  async logout(): Promise<void> {
    await firstValueFrom(this.http.post('/api/auth/logout', {}));
    this.currentUserSignal.set(null);
  }

  async loadCurrentUser(): Promise<void> {
    try {
      const user = await firstValueFrom(this.http.get<UserDto>('/api/auth/me'));
      this.currentUserSignal.set(user);
    } catch {
      this.currentUserSignal.set(null);
    }
  }
}

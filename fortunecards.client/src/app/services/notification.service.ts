import { Injectable, inject, signal } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Router, NavigationEnd } from '@angular/router';
import { Observable, filter } from 'rxjs';
import { PagedResult } from '../models/deck';
import { NotificationDto } from '../models/notification';
import { AuthService } from './auth.service';

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private readonly base = '/api/notifications';
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly auth = inject(AuthService);

  readonly unreadCount = signal(0);

  constructor() {
    this.router.events
      .pipe(filter((e) => e instanceof NavigationEnd))
      .subscribe(() => {
        if (this.auth.isLoggedIn()) this.refreshCount();
      });
  }

  list(page = 1, pageSize = 20): Observable<PagedResult<NotificationDto>> {
    const params = new HttpParams().set('page', page).set('pageSize', pageSize);
    return this.http.get<PagedResult<NotificationDto>>(this.base, { params });
  }

  refreshCount(): void {
    this.http.get<{ count: number }>(`${this.base}/unread-count`).subscribe({
      next: (r) => this.unreadCount.set(r.count),
      error: () => this.unreadCount.set(0),
    });
  }

  markRead(ids?: number[]): Observable<{ marked: number }> {
    return this.http.post<{ marked: number }>(`${this.base}/mark-read`, { ids: ids ?? null });
  }
}

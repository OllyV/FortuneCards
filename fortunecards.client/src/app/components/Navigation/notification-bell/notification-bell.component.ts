import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { NotificationDto } from '../../../models/notification';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'notification-bell',
  standalone: true,
  templateUrl: './notification-bell.component.html',
  styleUrl: './notification-bell.component.css',
  imports: [CommonModule, TranslocoDirective],
})
export class NotificationBellComponent {
  protected readonly notifications = inject(NotificationService);
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly open = signal(false);
  readonly items = signal<NotificationDto[]>([]);
  readonly loading = signal(false);

  toggle(): void {
    const next = !this.open();
    this.open.set(next);
    if (next) this.loadAndMarkRead();
  }

  private loadAndMarkRead(): void {
    this.loading.set(true);
    this.notifications.list(1, 20).subscribe({
      next: (res) => {
        this.items.set(res.items);
        this.loading.set(false);
        if (res.items.some((n) => !n.isRead)) {
          this.notifications.markRead().subscribe(() => this.notifications.refreshCount());
        }
      },
      error: () => this.loading.set(false),
    });
  }

  go(item: NotificationDto): void {
    this.open.set(false);
    this.router.navigateByUrl(item.targetRoute);
  }
}

import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentDto, CommentTargetType } from '../../../models/comment';
import { CommentService } from '../../../services/comment.service';
import { NotificationService } from '../../../services/notification.service';
import { AuthService } from '../../../services/auth.service';
import { CommentItemComponent } from '../comment-item/comment-item.component';

@Component({
  selector: 'comments-section',
  standalone: true,
  templateUrl: './comments-section.component.html',
  styleUrl: './comments-section.component.css',
  imports: [CommonModule, TranslocoDirective, CommentItemComponent],
})
export class CommentsSectionComponent implements OnInit {
  @Input({ required: true }) targetType!: CommentTargetType;
  @Input({ required: true }) targetId!: number;

  private readonly comments = inject(CommentService);
  private readonly notifications = inject(NotificationService);
  protected readonly auth = inject(AuthService);

  readonly open = signal(false);
  readonly items = signal<CommentDto[]>([]);
  readonly total = signal(0);
  readonly page = signal(1);
  readonly pageSize = 20;
  readonly loading = signal(false);
  readonly draft = signal('');
  readonly posting = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    // Fetch the count eagerly so the button can show "Comments (N)" before opening.
    this.load(1, false);
  }

  toggle(): void {
    this.open.update((v) => !v);
  }

  private load(page: number, append: boolean): void {
    this.loading.set(true);
    this.comments.list(this.targetType, this.targetId, page, this.pageSize).subscribe({
      next: (res) => {
        this.total.set(res.totalCount);
        this.page.set(res.page);
        this.items.set(append ? [...this.items(), ...res.items] : res.items);
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.error.set('load'); },
    });
  }

  reload(): void {
    this.load(1, false);
  }

  loadMore(): void {
    this.load(this.page() + 1, true);
  }

  hasMore(): boolean {
    return this.items().length < this.total();
  }

  post(): void {
    const body = this.draft().trim();
    if (!body) return;
    this.posting.set(true);
    this.comments.create({ targetType: this.targetType, targetId: this.targetId, body }).subscribe({
      next: () => {
        this.posting.set(false);
        this.draft.set('');
        this.reload();
        this.notifications.refreshCount();
      },
      error: () => { this.posting.set(false); this.error.set('save'); },
    });
  }
}

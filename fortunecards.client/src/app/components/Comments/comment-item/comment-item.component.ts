import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentDto } from '../../../models/comment';
import { CommentService } from '../../../services/comment.service';

@Component({
  selector: 'comment-item',
  standalone: true,
  templateUrl: './comment-item.component.html',
  styleUrl: './comment-item.component.css',
  imports: [CommonModule, TranslocoDirective],
})
export class CommentItemComponent {
  @Input({ required: true }) comment!: CommentDto;
  @Input() canReply = true;
  @Input() depth = 0;
  @Output() changed = new EventEmitter<void>();

  private readonly comments = inject(CommentService);

  readonly editing = signal(false);
  readonly replying = signal(false);
  readonly draft = signal('');
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  startEdit(): void {
    this.draft.set(this.comment.body ?? '');
    this.error.set(null);
    this.editing.set(true);
  }

  cancelEdit(): void {
    this.editing.set(false);
  }

  saveEdit(): void {
    const body = this.draft().trim();
    if (!body) return;
    this.busy.set(true);
    this.comments.update(this.comment.id, body).subscribe({
      next: () => { this.busy.set(false); this.editing.set(false); this.changed.emit(); },
      error: () => { this.busy.set(false); this.error.set('save'); },
    });
  }

  remove(): void {
    this.busy.set(true);
    this.comments.remove(this.comment.id).subscribe({
      next: () => { this.busy.set(false); this.changed.emit(); },
      error: () => { this.busy.set(false); this.error.set('save'); },
    });
  }

  startReply(): void {
    this.draft.set('');
    this.error.set(null);
    this.replying.set(true);
  }

  cancelReply(): void {
    this.replying.set(false);
  }

  saveReply(): void {
    const body = this.draft().trim();
    if (!body) return;
    this.busy.set(true);
    this.comments.create({
      targetType: this.comment.targetType,
      targetId: this.comment.targetId,
      parentCommentId: this.comment.id,
      body,
    }).subscribe({
      next: () => { this.busy.set(false); this.replying.set(false); this.changed.emit(); },
      error: () => { this.busy.set(false); this.error.set('save'); },
    });
  }
}

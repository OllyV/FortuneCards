import { Component, DestroyRef, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentService } from '../../../services/comment.service';
import { CommentTargetType, MyCommentDto } from '../../../models/comment';

@Component({
  selector: 'app-profile-comments',
  standalone: true,
  templateUrl: './profile-comments.component.html',
  styleUrl: './profile-comments.component.css',
  imports: [TranslocoDirective, DatePipe],
})
export class ProfileCommentsComponent {
  private readonly commentService = inject(CommentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly myComments = signal<MyCommentDto[]>([]);

  constructor() { this.load(); }

  private load(): void {
    this.commentService.listMine(1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.myComments.set(res.items), error: () => {} });
  }

  openComment(route: string): void { this.router.navigateByUrl(route); }

  restore(id: number): void {
    this.commentService.restore(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.load(), error: () => {} });
  }

  typeKey(t: CommentTargetType): string {
    if (t === CommentTargetType.Card) return 'comments.typeCard';
    if (t === CommentTargetType.Pattern) return 'comments.typePattern';
    return 'comments.typeDeck';
  }

  typeClass(t: CommentTargetType): string {
    if (t === CommentTargetType.Card) return 'card';
    if (t === CommentTargetType.Pattern) return 'pattern';
    return 'deck';
  }
}

import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentService } from '../../../services/comment.service';
import { MyCommentDto } from '../../../models/comment';

@Component({
  selector: 'app-profile-comments',
  standalone: true,
  templateUrl: './profile-comments.component.html',
  styleUrl: './profile-comments.component.css',
  imports: [TranslocoDirective],
})
export class ProfileCommentsComponent {
  private readonly commentService = inject(CommentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly myComments = signal<MyCommentDto[]>([]);

  constructor() {
    this.commentService.listMine(1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.myComments.set(res.items), error: () => {} });
  }

  openComment(route: string): void { this.router.navigateByUrl(route); }
}

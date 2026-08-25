import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { CommentsSectionComponent } from '../../Comments/comments-section/comments-section.component';
import { CommentTargetType } from '../../../models/comment';

@Component({
  selector: 'card-info-dialog',
  standalone: true,
  imports: [TranslocoDirective, CommentsSectionComponent],
  templateUrl: './card-info-dialog.component.html',
  styleUrl: './card-info-dialog.component.css',
})
export class CardInfoDialogComponent {
  readonly imageUrl = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();
  readonly aspectWidth = input(3);
  readonly aspectHeight = input(5);
  /** DB card id; when set, the card's comments are shown. */
  readonly cardId = input<number | null>(null);

  protected readonly CommentTargetType = CommentTargetType;

  readonly closed = output<void>();
}

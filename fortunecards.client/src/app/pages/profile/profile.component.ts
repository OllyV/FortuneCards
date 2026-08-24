import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { DeckService } from '../../services/deck.service';
import { CommentService } from '../../services/comment.service';
import { Deck } from '../../models/deck';
import { MyCommentDto } from '../../models/comment';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';
import { getDeckGradientStyle } from '../../utils/deck-colors';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  imports: [CommonModule, NavigationBar, TranslocoDirective],
})
export class ProfileComponent {
  protected readonly auth = inject(AuthService);
  private readonly deckService = inject(DeckService);
  private readonly commentService = inject(CommentService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  myComments = signal<MyCommentDto[]>([]);

  constructor() {
    this.deckService.getMyDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => {
          this.decks.set(all.filter(d => d.isOwner));
          this.loading.set(false);
        },
        error: () => { this.error.set(this.transloco.translate('errors.decksLoadFailed')); this.loading.set(false); }
      });

    this.commentService.listMine(1, 20)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (res) => this.myComments.set(res.items), error: () => {} });
  }

  getDeckGradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  goBack(): void {
    this.router.navigate(['/decks']);
  }

  goToSettings(): void {
    this.router.navigate(['/profile/settings']);
  }

  goToNewDeck(): void {
    this.router.navigate(['/decks/new']);
  }

  goToDeck(id: number): void {
    this.router.navigate(['/decks', id]);
  }

  goToComment(route: string): void {
    this.router.navigateByUrl(route);
  }
}

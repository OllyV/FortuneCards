import { Component, DestroyRef, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { DeckService } from '../../../services/deck.service';
import { Deck } from '../../../models/deck';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'app-profile-decks',
  standalone: true,
  templateUrl: './profile-decks.component.html',
  styleUrl: './profile-decks.component.css',
  imports: [TranslocoDirective],
})
export class ProfileDecksComponent {
  private readonly deckService = inject(DeckService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);

  readonly decks = signal<Deck[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor() {
    this.deckService.getMyDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (all) => { this.decks.set(all.filter((d) => d.isOwner)); this.loading.set(false); },
        error: () => { this.error.set(this.transloco.translate('errors.decksLoadFailed')); this.loading.set(false); },
      });
  }

  gradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  newDeck(): void { this.router.navigate(['/decks/new']); }
  openDeck(id: number): void { this.router.navigate(['/decks', id]); }
}

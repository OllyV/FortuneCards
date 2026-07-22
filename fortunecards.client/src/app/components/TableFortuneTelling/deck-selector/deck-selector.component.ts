import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Deck } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'deck-selector',
  standalone: true,
  templateUrl: './deck-selector.component.html',
  styleUrl: './deck-selector.component.css',
})
export class DeckSelectorComponent {
  private readonly deckService = inject(DeckService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly deckSelected = output<Deck>();
  readonly closed = output<void>();

  readonly decks = signal<Deck[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly isAuthorized = computed(() => this.auth.currentUser() !== null);

  readonly visibleDecks = computed<Deck[]>(() => {
    const all = this.decks();
    if (this.isAuthorized()) return all.filter((d) => d.isOwner || d.isFavorite);
    const publicDecks = all.filter((d) => d.isPublic);
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return publicDecks;
    return publicDecks.filter(
      (d) => d.name.toLowerCase().includes(term) || (d.description ?? '').toLowerCase().includes(term)
    );
  });

  constructor() {
    this.deckService
      .getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decks) => {
          this.decks.set(decks);
          this.loading.set(false);
        },
        error: () => {
          this.error.set('Failed to load decks.');
          this.loading.set(false);
        },
      });
  }

  gradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }

  selectDeck(deck: Deck): void {
    this.selectError.set(null);
    this.deckService
      .getDeck(deck.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) => {
          this.deckSelected.emit(full);
          this.closed.emit();
        },
        error: () => this.selectError.set('Failed to load deck.'),
      });
  }
}

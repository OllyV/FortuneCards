import { Component, signal, computed, inject, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute } from '@angular/router';
import { Deck } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../../utils/deck-colors';

export type DeckListMode = 'mine' | 'search';

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css'],
  standalone: false
})
export class DeckListComponent {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  mode = signal<DeckListMode>('mine');
  searchTerm = signal('');

  readonly visibleDecks = computed<Deck[]>(() => {
    const all = this.decks();
    if (this.mode() === 'mine') {
      return all.filter((d) => d.isOwner);
    }
    const publicDecks = all.filter((d) => d.isPublic);
    const term = this.searchTerm().trim().toLowerCase();
    if (!term) return publicDecks;
    return publicDecks.filter((d) =>
      d.name.toLowerCase().includes(term) ||
      (d.description ?? '').toLowerCase().includes(term));
  });

  readonly title = computed(() => this.mode() === 'mine' ? 'My Decks ✨' : 'Search Decks 🔍');

  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);

  constructor(private deckService: DeckService, private router: Router) {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.mode.set((data['mode'] as DeckListMode) ?? 'mine'));

    effect(() => {
      this.auth.currentUser();
      this.loadDecks();
    });
  }

  loadDecks(): void {
    this.loading.set(true);
    this.deckService.getDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (decks) => { this.decks.set(decks); this.loading.set(false); },
        error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); }
      });
  }

  getDeckGradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  getDeckShadow(colorIndex: number): string {
    return getDeckShadowStyle(colorIndex);
  }

  goToNew(): void {
    this.router.navigate(['/decks', 'new']);
  }

  onSearchInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }
}

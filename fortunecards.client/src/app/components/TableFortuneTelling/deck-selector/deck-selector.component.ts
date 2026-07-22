import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, switchMap, map, catchError, of } from 'rxjs';
import { Deck, PagedResult } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

const PAGE_SIZE = 12;

@Component({
  selector: 'deck-selector',
  standalone: true,
  templateUrl: './deck-selector.component.html',
  styleUrl: './deck-selector.component.css',
  imports: [PaginationComponent],
})
export class DeckSelectorComponent {
  private readonly deckService = inject(DeckService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly searchInput = new Subject<string>();
  private readonly pageLoad = new Subject<void>();

  readonly deckSelected = output<Deck>();
  readonly closed = output<void>();

  readonly decks = signal<Deck[]>([]);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);
  readonly selectError = signal<string | null>(null);
  readonly searchTerm = signal('');
  readonly page = signal(1);
  readonly pageSize = PAGE_SIZE;
  readonly totalCount = signal(0);
  readonly isAuthorized = computed(() => this.auth.currentUser() !== null);

  constructor() {
    this.searchInput
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.page.set(1);
        this.load();
      });

    this.pageLoad
      .pipe(
        switchMap(() =>
          this.deckService.getPublicDecks(this.searchTerm(), this.page(), this.pageSize).pipe(
            map((result): { result: PagedResult<Deck> | null; failed: boolean } => ({ result, failed: false })),
            catchError(() => of({ result: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ result, failed }) => {
        if (failed || !result) {
          this.error.set('Failed to load decks.');
          this.loading.set(false);
          return;
        }
        this.decks.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      });

    this.load();
  }

  private load(): void {
    if (this.isAuthorized()) {
      this.loading.set(true);
      this.error.set(null);
      this.deckService.getMyDecks()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (decks) => { this.decks.set(decks); this.loading.set(false); },
          error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); },
        });
      return;
    }
    this.triggerPublicLoad();
  }

  private triggerPublicLoad(): void {
    this.loading.set(true);
    this.error.set(null);
    this.pageLoad.next();
  }

  gradient(colorIndex: number): string {
    return getDeckGradientStyle(colorIndex);
  }

  onSearchInput(event: Event): void {
    this.searchInput.next((event.target as HTMLInputElement).value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.triggerPublicLoad();
  }

  selectDeck(deck: Deck): void {
    this.selectError.set(null);
    this.deckService.getDeck(deck.id)
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

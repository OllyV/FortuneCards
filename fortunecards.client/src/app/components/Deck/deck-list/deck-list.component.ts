import { Component, signal, inject, DestroyRef, effect } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, switchMap, map, catchError, of } from 'rxjs';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { Deck, PagedResult } from '../../../models/deck';
import { DeckService } from '../../../services/deck.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../../utils/deck-colors';

export type DeckListMode = 'mine' | 'search';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-deck-list',
  templateUrl: './deck-list.component.html',
  styleUrls: ['./deck-list.component.css'],
  standalone: true,
  imports: [RouterLink, NavigationBar, PaginationComponent],
})
export class DeckListComponent {
  decks = signal<Deck[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  mode = signal<DeckListMode>('mine');
  searchTerm = signal('');
  page = signal(1);
  readonly pageSize = PAGE_SIZE;
  totalCount = signal(0);

  readonly title = () => (this.mode() === 'mine' ? 'My Decks ✨' : 'Search Decks 🔍');

  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly searchInput = new Subject<string>();
  private readonly pageLoad = new Subject<void>();

  private ownedIds = new Set<number>();
  private favoriteIds = new Set<number>();
  private relationsLoaded = false;

  constructor(private deckService: DeckService, private router: Router) {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.mode.set((data['mode'] as DeckListMode) ?? 'mine'));

    this.searchInput
      .pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.page.set(1);
        this.loadDecks();
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
        this.decks.set(result.items.map((d) => this.overlay(d)));
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      });

    effect(() => {
      this.auth.currentUser();
      this.relationsLoaded = false;
      this.ownedIds = new Set();
      this.favoriteIds = new Set();
      this.page.set(1);
      this.loadDecks();
    });
  }

  loadDecks(): void {
    this.loading.set(true);
    this.error.set(null);
    if (this.mode() === 'mine') {
      this.deckService.getMyDecks()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (decks) => { this.decks.set(decks); this.loading.set(false); },
          error: () => { this.error.set('Failed to load decks.'); this.loading.set(false); },
        });
      return;
    }
    this.ensureRelations(() => this.loadPublicPage());
  }

  private ensureRelations(done: () => void): void {
    if (this.relationsLoaded || !this.auth.isLoggedIn()) { done(); return; }
    this.deckService.getMyDecks()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mine) => {
          this.ownedIds = new Set(mine.filter((d) => d.isOwner).map((d) => d.id));
          this.favoriteIds = new Set(mine.filter((d) => d.isFavorite).map((d) => d.id));
          this.relationsLoaded = true;
          done();
        },
        error: () => { this.relationsLoaded = true; done(); },
      });
  }

  private loadPublicPage(): void {
    this.loading.set(true);
    this.error.set(null);
    this.pageLoad.next();
  }

  private overlay(deck: Deck): Deck {
    return { ...deck, isOwner: this.ownedIds.has(deck.id), isFavorite: this.favoriteIds.has(deck.id) };
  }

  getDeckGradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  getDeckShadow(colorIndex: number): string { return getDeckShadowStyle(colorIndex); }

  goToNew(): void { this.router.navigate(['/decks', 'new']); }

  onSearchInput(event: Event): void {
    this.searchInput.next((event.target as HTMLInputElement).value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.loadPublicPage();
  }

  toggleFavorite(deck: Deck, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const next = !deck.isFavorite;
    this.setFavorite(deck.id, next);
    const request = next ? this.deckService.addFavorite(deck.id) : this.deckService.removeFavorite(deck.id);
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => this.setFavorite(deck.id, !next) });
  }

  private setFavorite(id: number, value: boolean): void {
    if (value) { this.favoriteIds.add(id); } else { this.favoriteIds.delete(id); }
    this.decks.update((all) => all.map((d) => (d.id === id ? { ...d, isFavorite: value } : d)));
  }
}

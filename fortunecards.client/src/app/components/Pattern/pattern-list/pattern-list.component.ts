import { Component, DestroyRef, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, ActivatedRoute, RouterLink } from '@angular/router';
import { Subject, debounceTime, switchMap, map, catchError, of } from 'rxjs';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { SkeletonCardGridComponent } from '../../shared/skeleton/skeleton-card-grid.component';
import { ErrorStateComponent } from '../../shared/error-state/error-state.component';
import { Pattern, PagedResult } from '../../../models/pattern';
import { PatternService } from '../../../services/pattern.service';
import { AuthService } from '../../../services/auth.service';
import { getDeckGradientStyle, getDeckShadowStyle } from '../../../utils/deck-colors';

export type PatternListMode = 'mine' | 'search';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-pattern-list',
  templateUrl: './pattern-list.component.html',
  styleUrls: ['./pattern-list.component.css'],
  standalone: true,
  imports: [RouterLink, NavigationBar, PaginationComponent, SkeletonCardGridComponent, ErrorStateComponent, TranslocoDirective],
})
export class PatternListComponent {
  patterns = signal<Pattern[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);
  mode = signal<PatternListMode>('mine');
  searchTerm = signal('');
  page = signal(1);
  readonly pageSize = PAGE_SIZE;
  totalCount = signal(0);

  protected readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly transloco = inject(TranslocoService);
  private readonly searchInput = new Subject<string>();
  private readonly pageLoad = new Subject<void>();

  private ownedIds = new Set<number>();
  private favoriteIds = new Set<number>();
  private relationsLoaded = false;

  constructor(private patternService: PatternService, private router: Router) {
    this.route.data
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((data) => this.mode.set((data['mode'] as PatternListMode) ?? 'mine'));

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
          this.patternService.getPublicPatterns(this.searchTerm(), this.page(), this.pageSize).pipe(
            map((result): { result: PagedResult<Pattern> | null; failed: boolean } => ({ result, failed: false })),
            catchError(() => of({ result: null, failed: true })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ result, failed }) => {
        if (failed || !result) {
          this.error.set(this.transloco.translate('errors.patternsLoadFailed'));
          this.loading.set(false);
          return;
        }
        this.patterns.set(result.items.map((p) => this.overlay(p)));
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      });

    effect(() => {
      this.auth.currentUser();
      this.relationsLoaded = false;
      this.ownedIds = new Set();
      this.favoriteIds = new Set();
      this.page.set(1);
      this.load();
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    if (this.mode() === 'mine') {
      this.patternService.getMyPatterns()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (patterns) => { this.patterns.set(patterns); this.loading.set(false); },
          error: () => { this.error.set(this.transloco.translate('errors.patternsLoadFailed')); this.loading.set(false); },
        });
      return;
    }
    this.ensureRelations(() => this.loadPublicPage());
  }

  private ensureRelations(done: () => void): void {
    if (this.relationsLoaded || !this.auth.isLoggedIn()) { done(); return; }
    this.patternService.getMyPatterns()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (mine) => {
          this.ownedIds = new Set(mine.filter((p) => p.isOwner).map((p) => p.id));
          this.favoriteIds = new Set(mine.filter((p) => p.isFavorite).map((p) => p.id));
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

  private overlay(pattern: Pattern): Pattern {
    return { ...pattern, isOwner: this.ownedIds.has(pattern.id), isFavorite: this.favoriteIds.has(pattern.id) };
  }

  getGradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }
  getShadow(colorIndex: number): string { return getDeckShadowStyle(colorIndex); }

  goToNew(): void { this.router.navigate(['/patterns', 'new']); }

  onSearchInput(event: Event): void {
    this.searchInput.next((event.target as HTMLInputElement).value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.loadPublicPage();
  }

  toggleFavorite(pattern: Pattern, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const next = !pattern.isFavorite;
    this.setFavorite(pattern.id, next);
    const request = next ? this.patternService.addFavorite(pattern.id) : this.patternService.removeFavorite(pattern.id);
    request
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ error: () => this.setFavorite(pattern.id, !next) });
  }

  private setFavorite(id: number, value: boolean): void {
    if (value) { this.favoriteIds.add(id); } else { this.favoriteIds.delete(id); }
    this.patterns.update((all) => all.map((p) => (p.id === id ? { ...p, isFavorite: value } : p)));
  }
}

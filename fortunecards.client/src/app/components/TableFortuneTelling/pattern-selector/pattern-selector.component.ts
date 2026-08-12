import { Component, DestroyRef, computed, inject, output, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, switchMap, map, catchError, of } from 'rxjs';
import { TranslocoDirective, TranslocoService } from '@jsverse/transloco';
import { Pattern, PagedResult } from '../../../models/pattern';
import { PatternService } from '../../../services/pattern.service';
import { AuthService } from '../../../services/auth.service';
import { PaginationComponent } from '../../shared/pagination/pagination.component';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

const PAGE_SIZE = 12;

@Component({
  selector: 'pattern-selector',
  standalone: true,
  templateUrl: './pattern-selector.component.html',
  styleUrl: './pattern-selector.component.css',
  imports: [PaginationComponent, TranslocoDirective],
})
export class PatternSelectorComponent {
  private readonly patternService = inject(PatternService);
  private readonly auth = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly transloco = inject(TranslocoService);
  private readonly searchInput = new Subject<string>();
  private readonly pageLoad = new Subject<void>();

  readonly patternSelected = output<Pattern>();
  readonly closed = output<void>();

  readonly patterns = signal<Pattern[]>([]);
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
        this.patterns.set(result.items);
        this.totalCount.set(result.totalCount);
        this.loading.set(false);
      });

    this.load();
  }

  private load(): void {
    if (this.isAuthorized()) {
      this.loading.set(true);
      this.error.set(null);
      this.patternService.getMyPatterns()
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (patterns) => { this.patterns.set(patterns); this.loading.set(false); },
          error: () => { this.error.set(this.transloco.translate('errors.patternsLoadFailed')); this.loading.set(false); },
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

  gradient(colorIndex: number): string { return getDeckGradientStyle(colorIndex); }

  onSearchInput(event: Event): void {
    this.searchInput.next((event.target as HTMLInputElement).value);
  }

  onPageChange(page: number): void {
    this.page.set(page);
    this.triggerPublicLoad();
  }

  selectPattern(pattern: Pattern): void {
    this.selectError.set(null);
    this.patternService.getPattern(pattern.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (full) => { this.patternSelected.emit(full); this.closed.emit(); },
        error: () => this.selectError.set(this.transloco.translate('errors.patternLoadFailed')),
      });
  }
}

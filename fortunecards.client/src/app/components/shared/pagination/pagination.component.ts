import { Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  standalone: true,
  template: `
    @if (totalPages() > 1) {
      <nav class="pagination" aria-label="Pagination">
        <button type="button" class="page-btn" [disabled]="!canPrev()" (click)="prev()" aria-label="Previous page">‹</button>
        <span class="page-status">Page {{ page() }} of {{ totalPages() }}</span>
        <button type="button" class="page-btn" [disabled]="!canNext()" (click)="next()" aria-label="Next page">›</button>
      </nav>
    }
  `,
  styles: [`
    .pagination { display: flex; align-items: center; gap: 0.75rem; justify-content: center; margin-top: 1rem; }
    .page-btn { border: none; border-radius: 999px; width: 2rem; height: 2rem; cursor: pointer; font-size: 1.1rem; }
    .page-btn:disabled { opacity: 0.4; cursor: default; }
    .page-status { font-size: 0.9rem; }
  `],
})
export class PaginationComponent {
  readonly page = input.required<number>();
  readonly pageSize = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly pageChange = output<number>();

  readonly totalPages = computed(() => Math.max(1, Math.ceil(this.totalCount() / this.pageSize())));
  readonly canPrev = computed(() => this.page() > 1);
  readonly canNext = computed(() => this.page() < this.totalPages());

  prev(): void {
    if (this.canPrev()) {
      this.pageChange.emit(this.page() - 1);
    }
  }

  next(): void {
    if (this.canNext()) {
      this.pageChange.emit(this.page() + 1);
    }
  }
}

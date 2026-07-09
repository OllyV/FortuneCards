import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { TableCardComponent } from '../table-card/table-card.component';
import { TableSettingsDialogComponent } from '../table-settings-dialog/table-settings-dialog.component';
import { TableDeckCard, TableColor } from '../../../models/table';

@Component({
  selector: 'app-table',
  standalone: true,
  templateUrl: './table.component.html',
  styleUrl: './table.component.css',
  imports: [NavigationBar, TableCardComponent, TableSettingsDialogComponent],
  host: {
    '(document:keydown)': 'onKeyDown($event)',
    '(document:keyup)': 'onKeyUp($event)',
    '(window:blur)': 'onWindowBlur()',
  },
})
export class TableComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly tableRef = viewChild.required<ElementRef<HTMLDivElement>>('table');
  private rotateKeyHeld = false;

  readonly tableColor = signal<TableColor>('beige');
  /** Card width, in % of table width (5–50). */
  readonly cardSizePercent = signal(20);
  readonly settingsOpen = signal(false);
  /** Table height, in % of table width; 0 = not yet measured. */
  readonly tableHeightPercent = signal(0);
  readonly tableWidthPx = signal(0);
  readonly cards = signal<TableDeckCard[]>([{ kind: 'deck', id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
  readonly selectedCardId = signal<string | null>(null);

  readonly heightStyle = computed(() =>
    this.tableWidthPx() > 0 && this.tableHeightPercent() > 0
      ? `${(this.tableHeightPercent() / 100) * this.tableWidthPx()}px`
      : '100vh'
  );

  /** Minimum table height: bottom edge of the lowest card + 5% of table width. */
  readonly minHeightPercent = computed(() => {
    const cardHeight = this.cardSizePercent() * 1.5;
    const lowestBottom = this.cards().reduce((max, c) => Math.max(max, c.y + cardHeight), 0);
    return lowestBottom + 5;
  });

  ngAfterViewInit(): void {
    const el = this.tableRef().nativeElement;
    const width = el.getBoundingClientRect().width;
    if (width > 0) {
      this.tableWidthPx.set(width);
      // Initial table height = table-width, stored in table-width % so it rescales.
      this.tableHeightPercent.set(100);
    }
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0) this.tableWidthPx.set(w);
      });
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  selectCard(id: string): void {
    this.selectedCardId.set(id);
  }

  onTablePointerDown(event: Event): void {
    if (event.target === this.tableRef().nativeElement) {
      this.selectedCardId.set(null);
    }
  }

  flipCard(id: string): void {
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, flipped: !c.flipped } : c)));
  }

  moveCard(id: string, pos: { x: number; y: number }): void {
    const cardHeight = this.cardSizePercent() * 1.5; // aspect ratio 2/3
    const maxX = Math.max(0, 100 - this.cardSizePercent());
    const maxY = Math.max(0, this.tableHeightPercent() - cardHeight);
    const x = Math.min(maxX, Math.max(0, pos.x));
    const y = Math.min(maxY, Math.max(0, pos.y));
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, x, y } : c)));
  }

  rotateCard(id: string, rotation: number): void {
    const normalized = ((rotation % 360) + 360) % 360;
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, rotation: normalized } : c)));
  }

  increaseHeight(): void {
    this.tableHeightPercent.update((h) => h + this.cardSizePercent());
  }

  decreaseHeight(): void {
    this.tableHeightPercent.update((h) => Math.max(this.minHeightPercent(), h - this.cardSizePercent()));
  }

  onCardSizeChange(size: number): void {
    this.cardSizePercent.set(size);
    this.tableHeightPercent.update((h) => Math.max(h, this.minHeightPercent()));
  }

  onKeyDown(event: KeyboardEvent): void {
    if (this.settingsOpen()) return;
    if (event.key === 'r' || event.key === 'R') {
      this.rotateKeyHeld = true;
      return;
    }
    if (!this.rotateKeyHeld) return;
    const id = this.selectedCardId();
    if (!id) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      const delta = event.key === 'ArrowLeft' ? -1 : 1;
      const card = this.cards().find((c) => c.id === id);
      if (card) this.rotateCard(id, card.rotation + delta);
    }
  }

  onKeyUp(event: KeyboardEvent): void {
    if (event.key === 'r' || event.key === 'R') {
      this.rotateKeyHeld = false;
    }
  }

  onWindowBlur(): void {
    this.rotateKeyHeld = false;
  }
}

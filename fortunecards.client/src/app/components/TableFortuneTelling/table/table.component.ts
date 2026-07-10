import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { TableCardComponent } from '../table-card/table-card.component';
import { TablePatternCardComponent } from '../table-pattern-card/table-pattern-card.component';
import { TableSettingsDialogComponent } from '../table-settings-dialog/table-settings-dialog.component';
import { TableDeckCard, TablePatternCard, TableColor } from '../../../models/table';
import { Deck } from '../../../models/deck';

@Component({
  selector: 'app-table',
  standalone: true,
  templateUrl: './table.component.html',
  styleUrl: './table.component.css',
  imports: [NavigationBar, TableCardComponent, TablePatternCardComponent, TableSettingsDialogComponent],
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
  private nextPatternId = 1;
  private nextDeckCardId = 1;

  readonly tableColor = signal<TableColor>('beige');
  /** Card width, in % of table width (5–50). */
  readonly cardSizePercent = signal(15);
  readonly settingsOpen = signal(false);
  /** Table height, in % of table width; 0 = not yet measured. */
  readonly tableHeightPercent = signal(0);
  readonly tableWidthPx = signal(0);
  readonly cards = signal<TableDeckCard[]>([]);
  readonly patternCards = signal<TablePatternCard[]>([]);
  readonly patternsLocked = signal(false);
  readonly selectedCardId = signal<string | null>(null);

  readonly heightStyle = computed(() =>
    this.tableWidthPx() > 0 && this.tableHeightPercent() > 0
      ? `${(this.tableHeightPercent() / 100) * this.tableWidthPx()}px`
      : '100vh'
  );

  /** Minimum table height: bottom edge of the lowest card + 5% of table width. */
  readonly minHeightPercent = computed(() => {
    const cardHeight = this.cardSizePercent() * 1.5;
    const lowestBottom = [...this.cards(), ...this.patternCards()].reduce(
      (max, c) => Math.max(max, c.y + cardHeight),
      0
    );
    return lowestBottom + 5;
  });

  ngAfterViewInit(): void {
    const el = this.tableRef().nativeElement;
    const width = el.getBoundingClientRect().width;
    if (width > 0) {
      this.tableWidthPx.set(width);
      // Initial table height ≈ viewport height (as a % of table width), floored at the
      // minimum needed to fit the cards, so it rescales with the table width.
      this.tableHeightPercent.set(Math.max((window.innerHeight / width) * 80, this.minHeightPercent()));
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

  addPatternCard(): void {
    this.patternCards.update((cards) => {
      const order = cards.length + 1;
      return [
        ...cards,
        {
          kind: 'pattern' as const,
          id: `pattern-${this.nextPatternId++}`,
          x: 5,
          y: 5,
          rotation: 0,
          text: `Position ${order}`,
          order,
          locked: this.patternsLocked(),
        },
      ];
    });
    this.tableHeightPercent.update((h) => Math.max(h, this.minHeightPercent()));
  }

  loadDeck(deck: Deck): void {
    const cardWidth = this.cardSizePercent();
    const cardHeight = cardWidth * 1.5;
    const source = deck.cards ?? [];

    // Row capacity: max cards whose gaps stay >= 20% of card width across x = 5..95.
    const usable = 90;
    const minGap = 0.2 * cardWidth;
    const n = Math.max(1, Math.floor((usable + minGap) / (cardWidth + minGap)));
    const gap = n > 1 ? (usable - n * cardWidth) / (n - 1) : 0;
    const lines = source.length > 0 ? Math.ceil(source.length / n) : 0;

    const placed: TableDeckCard[] = source.map((card, i) => ({
      kind: 'deck' as const,
      id: `card-${this.nextDeckCardId++}`,
      x: 5 + (i % n) * (cardWidth + gap),
      y: 5 + Math.floor(i / n) * (cardHeight + 5),
      rotation: 0,
      flipped: false,
      deckId: deck.id,
      cardId: card.id,
      colorIndex: deck.colorIndex,
      frontImageUrl: card.imageUrl,
      backImageUrl: deck.cardBackImageUrl,
    }));

    // Push existing items (pattern cards) below the new block and grow the table.
    const existing = this.patternCards();
    if (placed.length > 0 && existing.length > 0) {
      const topmost = existing.reduce((min, c) => Math.min(min, c.y), Infinity);
      const distance = Math.max(0, lines * (cardHeight + 5) + 5 - topmost);
      if (distance > 0) {
        this.patternCards.update((items) => items.map((c) => ({ ...c, y: c.y + distance })));
        this.tableHeightPercent.update((h) => h + distance);
      }
    }

    this.cards.set(placed);
    this.tableHeightPercent.update((h) => Math.max(h, this.minHeightPercent()));
  }

  toggleLockPattern(): void {
    const locked = !this.patternsLocked();
    this.patternsLocked.set(locked);
    this.patternCards.update((cards) => cards.map((c) => ({ ...c, locked })));
  }

  movePatternCard(id: string, pos: { x: number; y: number }): void {
    const cardHeight = this.cardSizePercent() * 1.5;
    const maxX = Math.max(0, 100 - this.cardSizePercent());
    const maxY = Math.max(0, this.tableHeightPercent() - cardHeight);
    const x = Math.min(maxX, Math.max(0, pos.x));
    const y = Math.min(maxY, Math.max(0, pos.y));
    this.patternCards.update((cards) =>
      cards.map((c) => (c.id === id && !c.locked ? { ...c, x, y } : c))
    );
  }

  rotatePatternCard(id: string, rotation: number): void {
    const normalized = ((rotation % 360) + 360) % 360;
    this.patternCards.update((cards) =>
      cards.map((c) => (c.id === id && !c.locked ? { ...c, rotation: normalized } : c))
    );
  }

  setPatternText(id: string, text: string): void {
    this.patternCards.update((cards) => cards.map((c) => (c.id === id ? { ...c, text } : c)));
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
      const deck = this.cards().find((c) => c.id === id);
      if (deck) {
        this.rotateCard(id, deck.rotation + delta);
        return;
      }
      const pattern = this.patternCards().find((c) => c.id === id);
      if (pattern) this.rotatePatternCard(id, pattern.rotation + delta);
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

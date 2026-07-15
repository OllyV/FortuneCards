import { AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { NavigationBar } from '../../Navigation/navigation-bar/navigation-bar';
import { TableCardComponent } from '../table-card/table-card.component';
import { TablePatternCardComponent } from '../table-pattern-card/table-pattern-card.component';
import { TableSettingsDialogComponent } from '../table-settings-dialog/table-settings-dialog.component';
import { DeckSelectorComponent } from '../deck-selector/deck-selector.component';
import { CardInfoDialogComponent } from '../card-info-dialog/card-info-dialog.component';
import { TableDeckCard, TablePatternCard, TableColor } from '../../../models/table';
import { Deck } from '../../../models/deck';

@Component({
  selector: 'app-table',
  standalone: true,
  templateUrl: './table.component.html',
  styleUrl: './table.component.css',
  imports: [NavigationBar, TableCardComponent, TablePatternCardComponent, TableSettingsDialogComponent, DeckSelectorComponent, CardInfoDialogComponent],
})
export class TableComponent implements AfterViewInit {
  private readonly destroyRef = inject(DestroyRef);
  private readonly tableRef = viewChild.required<ElementRef<HTMLDivElement>>('table');
  private nextPatternId = 1;
  private nextDeckCardId = 1;
  private nextZ = 1;

  readonly tableColor = signal<TableColor>('beige');
  /** Card width, in % of table width (5–50). */
  readonly cardSizePercent = signal(15);
  readonly settingsOpen = signal(false);
  readonly deckSelectorOpen = signal(false);
  readonly deckMenuOpen = signal(false);
  readonly patternMenuOpen = signal(false);
  /** Table height, in % of table width; 0 = not yet measured. */
  readonly tableHeightPercent = signal(0);
  readonly tableWidthPx = signal(0);
  readonly cards = signal<TableDeckCard[]>([]);
  readonly patternCards = signal<TablePatternCard[]>([]);
  readonly patternsLocked = signal(false);
  readonly selectedCardId = signal<string | null>(null);
  readonly infoCardId = signal<string | null>(null);
  readonly infoCard = computed(() => this.cards().find((c) => c.id === this.infoCardId()) ?? null);

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
    const z = this.nextZ++;
    if (this.cards().some((c) => c.id === id)) {
      this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, z } : c)));
    } else {
      this.patternCards.update((cards) => cards.map((c) => (c.id === id ? { ...c, z } : c)));
    }
  }

  onTablePointerDown(event: Event): void {
    if (event.target === this.tableRef().nativeElement) {
      this.selectedCardId.set(null);
    }
  }

  flipCard(id: string): void {
    this.cards.update((cards) => cards.map((c) => (c.id === id ? { ...c, flipped: !c.flipped } : c)));
  }

  openCardInfo(id: string): void {
    this.infoCardId.set(id);
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
    const cards: TableDeckCard[] = (deck.cards ?? []).map((card) => ({
      kind: 'deck' as const,
      id: `card-${this.nextDeckCardId++}`,
      x: 0,
      y: 0,
      rotation: 0,
      flipped: false,
      deckId: deck.id,
      cardId: card.id,
      colorIndex: deck.colorIndex,
      frontImageUrl: card.imageUrl,
      backImageUrl: deck.cardBackImageUrl,
      title: card.title,
      description: card.description,
    }));
    this.placeCards(cards);
  }

  /** Fisher–Yates shuffle; returns a new array. A seam so tests can pin the order. */
  private shuffle<T>(items: T[]): T[] {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  /**
   * Lay the given deck cards out in justified rows at their starting position — face down,
   * unrotated — in a random order, pushing pattern cards below the block and fitting the table.
   * Used both when a deck is loaded and when it is re-loaded to re-shuffle the current cards.
   */
  private placeCards(cards: TableDeckCard[]): void {
    const cardWidth = this.cardSizePercent();
    const cardHeight = cardWidth * 1.5;

    // Row capacity: max cards whose gaps stay >= 20% of card width across x = 5..95.
    const usable = 90;
    const minGap = 0.2 * cardWidth;
    const n = Math.max(1, Math.floor((usable - cardWidth) / minGap ) + 1);
    const gap = n > 1 ? (usable - cardWidth) / (n - 1) : 0;
    const lines = cards.length > 0 ? Math.ceil(cards.length / n) : 0;

    const placed: TableDeckCard[] = this.shuffle(cards).map((card, i) => ({
      ...card,
      x: 5 + (i % n) * gap,
      y: 7 + Math.floor(i / n) * (cardHeight + 5),
      z: i,
      rotation: 0,
      flipped: false,
    }));

    // Push existing pattern cards below the new deck block so they don't overlap it.
    const existing = this.patternCards();
    if (placed.length > 0 && existing.length > 0) {
      const topmost = existing.reduce((min, c) => Math.min(min, c.y), Infinity);
      const distance = Math.max(0, lines * (cardHeight + 5) + 5 - topmost);
      if (distance > 0) {
        this.patternCards.update((items) => items.map((c) => ({ ...c, y: c.y + distance })));
      }
    }

    this.cards.set(placed);
    // Keep the selection counter ahead of the cards' initial z (i) so the next selected
    // card still comes to the front.
    this.nextZ = Math.max(this.nextZ, placed.length);
    // Extend the table only if a card now sits below its bottom edge; fit the lowest card.
    this.tableHeightPercent.update((h) => Math.max(h, this.minHeightPercent()));
  }

  toggleLockPattern(): void {
    const locked = !this.patternsLocked();
    this.patternsLocked.set(locked);
    // Send the pattern cards behind every deck card — they act as background slots the
    // deck cards get dealt onto — while keeping their relative stacking order among themselves.
    const minCardZ = this.cards().reduce((min, c) => Math.min(min, c.z ?? 0), 0);
    const ordered = [...this.patternCards()].sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
    const baseZ = minCardZ - ordered.length;
    const zById = new Map(ordered.map((c, i) => [c.id, baseZ + i]));
    this.patternCards.update((cards) => cards.map((c) => ({ ...c, locked, z: zById.get(c.id) })));
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

  onDeckSelected(deck: Deck): void {
    this.loadDeck(deck);
    this.deckSelectorOpen.set(false);
  }

  toggleDeckMenu(): void {
    this.patternMenuOpen.set(false);
    this.deckMenuOpen.update((v) => !v);
  }

  togglePatternMenu(): void {
    this.deckMenuOpen.set(false);
    this.patternMenuOpen.update((v) => !v);
  }

  closeMenus(): void {
    this.deckMenuOpen.set(false);
    this.patternMenuOpen.set(false);
  }

  openDeckSelector(): void {
    this.closeMenus();
    this.deckSelectorOpen.set(true);
  }

  reloadDeck(): void {
    this.closeMenus();
    this.placeCards(this.cards());
  }
}

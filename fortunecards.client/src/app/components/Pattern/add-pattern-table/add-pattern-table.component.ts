import {
  AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, output, signal, viewChild,
} from '@angular/core';
import { PatternPositionCardComponent } from '../pattern-position-card/pattern-position-card.component';
import { EditablePatternCard } from '../../../models/pattern';

/** Position-card aspect ratio (matches the default deck card shape). */
const ASPECT_W = 3;
const ASPECT_H = 5;

@Component({
  selector: 'add-pattern-table',
  standalone: true,
  templateUrl: './add-pattern-table.component.html',
  styleUrl: './add-pattern-table.component.css',
  imports: [PatternPositionCardComponent],
})
export class AddPatternTableComponent implements AfterViewInit {
  readonly cards = input.required<EditablePatternCard[]>();
  readonly cardSizePercent = input.required<number>();
  readonly tableHeightPercent = input.required<number>();
  readonly selectedId = input<string | null>(null);

  readonly cardSelect = output<string>();
  readonly cardMove = output<{ id: string; x: number; y: number }>();
  readonly cardRotate = output<{ id: string; rotation: number }>();
  readonly cardSizeChange = output<number>();
  readonly tableHeightChange = output<number>();

  readonly aspectWidth = ASPECT_W;
  readonly aspectHeight = ASPECT_H;

  private readonly destroyRef = inject(DestroyRef);
  private readonly tableRef = viewChild.required<ElementRef<HTMLDivElement>>('table');
  private readonly _widthPx = signal(0);
  readonly tableWidthPx = this._widthPx.asReadonly();

  /** Card height as a multiple of card width, from the fixed aspect ratio. */
  private readonly cardHeightMultiplier = ASPECT_H / ASPECT_W;

  /** Minimum table height: bottom edge of the lowest card + 5% of table width. */
  readonly minHeightPercent = computed(() => {
    const cardHeight = this.cardSizePercent() * this.cardHeightMultiplier;
    const lowestBottom = this.cards().reduce((max, c) => Math.max(max, c.y + cardHeight), 0);
    return lowestBottom + 5;
  });

  readonly heightStyle = computed(() =>
    this.tableWidthPx() > 0 && this.tableHeightPercent() > 0
      ? `${(this.tableHeightPercent() / 100) * this.tableWidthPx()}px`
      : '60vh'
  );

  ngAfterViewInit(): void {
    const el = this.tableRef().nativeElement;
    const width = el.getBoundingClientRect().width;
    if (width > 0) this._widthPx.set(width);
    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        const w = entries[0]?.contentRect.width ?? 0;
        if (w > 0) this._widthPx.set(w);
      });
      observer.observe(el);
      this.destroyRef.onDestroy(() => observer.disconnect());
    }
  }

  onCardSizeInput(event: Event): void {
    this.cardSizeChange.emit(Number((event.target as HTMLInputElement).value));
  }

  increaseHeight(): void {
    this.tableHeightChange.emit(this.tableHeightPercent() + this.cardSizePercent());
  }

  decreaseHeight(): void {
    this.tableHeightChange.emit(Math.max(this.minHeightPercent(), this.tableHeightPercent() - this.cardSizePercent()));
  }
}

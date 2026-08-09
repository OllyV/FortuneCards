import {
  AfterViewInit, Component, DestroyRef, ElementRef, computed, inject, input, signal, viewChild,
} from '@angular/core';
import { PatternPositionCardComponent } from '../pattern-position-card/pattern-position-card.component';
import { EditablePatternCard } from '../../../models/pattern';

/** Position-card aspect ratio (matches the default deck card shape). */
const ASPECT_W = 3;
const ASPECT_H = 5;

@Component({
  selector: 'app-pattern-table-view',
  standalone: true,
  templateUrl: './pattern-table-view.component.html',
  styleUrl: './pattern-table-view.component.css',
  imports: [PatternPositionCardComponent],
})
export class PatternTableViewComponent implements AfterViewInit {
  readonly cards = input.required<EditablePatternCard[]>();
  readonly cardSizePercent = input.required<number>();
  readonly tableHeightPercent = input.required<number>();

  readonly aspectWidth = ASPECT_W;
  readonly aspectHeight = ASPECT_H;

  private readonly destroyRef = inject(DestroyRef);
  private readonly tableRef = viewChild.required<ElementRef<HTMLDivElement>>('table');
  private readonly _widthPx = signal(0);
  readonly tableWidthPx = this._widthPx.asReadonly();

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
}

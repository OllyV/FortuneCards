import { Component, ElementRef, afterRenderEffect, computed, input, output, viewChild } from '@angular/core';
import { TablePatternCard } from '../../../models/table';

@Component({
  selector: 'table-pattern-card',
  standalone: true,
  templateUrl: './table-pattern-card.component.html',
  styleUrl: './table-pattern-card.component.css',
})
export class TablePatternCardComponent {
  readonly card = input.required<TablePatternCard>();
  /** Card width as % of table width. */
  readonly widthPercent = input.required<number>();
  readonly tableWidthPx = input.required<number>();
  readonly selected = input(false);
  readonly active = input(false);
  readonly dimmed = input(false);

  readonly cardSelect = output<void>();
  /** New top-left in % of table width; parent is responsible for clamping. */
  readonly cardMove = output<{ x: number; y: number }>();
  /** New absolute rotation in degrees; parent is responsible for normalizing. */
  readonly cardRotate = output<number>();
  readonly textChange = output<string>();

  readonly leftPx = computed(() => (this.card().x / 100) * this.tableWidthPx());
  readonly topPx = computed(() => (this.card().y / 100) * this.tableWidthPx());
  readonly widthPx = computed(() => (this.widthPercent() / 100) * this.tableWidthPx());

  private readonly textRef = viewChild<ElementRef<HTMLTextAreaElement>>('text');

  /** Smallest font we shrink to before letting the text clip, in px. */
  private static readonly MIN_FONT_PX = 7;

  constructor() {
    // Re-fit the font whenever the text or the card size changes.
    afterRenderEffect(() => {
      this.card().text;
      this.widthPx();
      this.fitText();
    });
  }

  /**
   * Shrink the pattern text's font until it fits inside the card. Starts at a max
   * scaled to the card width and steps down 1px at a time while the content
   * overflows, down to MIN_FONT_PX. Applied imperatively so it doesn't fight a
   * template binding (and is an inert no-op where the DOM isn't laid out, e.g. tests).
   */
  private fitText(): void {
    const el = this.textRef()?.nativeElement;
    const width = this.widthPx();
    if (!el || width <= 0) return;

    const max = Math.max(TablePatternCardComponent.MIN_FONT_PX, Math.round(width * 0.16));
    let size = max;
    el.style.fontSize = `${size}px`;
    while (
      size > TablePatternCardComponent.MIN_FONT_PX &&
      (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)
    ) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }

  private dragging = false;
  private rotating = false;
  private startPointerX = 0;
  private startPointerY = 0;
  private startCardX = 0;
  private startCardY = 0;
  private centerX = 0;
  private centerY = 0;
  private startAngle = 0;
  private startRotation = 0;

  onPointerDown(event: PointerEvent): void {
    if (this.card().locked) return;
    this.cardSelect.emit();
    this.dragging = true;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.startCardX = this.card().x;
    this.startCardY = this.card().y;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.card().locked) return;
    if (this.rotating) {
      this.cardRotate.emit(this.startRotation + (this.pointerAngle(event) - this.startAngle));
      return;
    }
    if (!this.dragging) return;
    const width = this.tableWidthPx();
    if (width <= 0) return;
    const dx = ((event.clientX - this.startPointerX) / width) * 100;
    const dy = ((event.clientY - this.startPointerY) / width) * 100;
    this.cardMove.emit({ x: this.startCardX + dx, y: this.startCardY + dy });
  }

  onPointerUp(): void {
    this.dragging = false;
    this.rotating = false;
  }

  onRotateStart(event: PointerEvent): void {
    if (this.card().locked) return;
    event.stopPropagation();
    this.rotating = true;
    this.dragging = false;
    const rect = (event.currentTarget as HTMLElement).closest('.table-pattern-card')!.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.startAngle = this.pointerAngle(event);
    this.startRotation = this.card().rotation;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  private pointerAngle(event: PointerEvent): number {
    return (Math.atan2(event.clientY - this.centerY, event.clientX - this.centerX) * 180) / Math.PI;
  }
}

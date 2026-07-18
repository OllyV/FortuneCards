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
  readonly aspectWidth = input(3);
  readonly aspectHeight = input(5);

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
  private readonly orderRef = viewChild<ElementRef<HTMLElement>>('order');

  // Length-driven split between the order number and the text. Short labels give
  // the number most of the card; long labels grow the text up to MAX_TEXT_FRACTION.
  private static readonly SHORT_LEN = 8;
  private static readonly LONG_LEN = 40;
  private static readonly MIN_TEXT_FRACTION = 0.3;
  private static readonly MAX_TEXT_FRACTION = 0.8;
  /** Font floors, in px: text shrinks small enough to always wrap; number stays legible. */
  private static readonly TEXT_FLOOR_PX = 4;
  private static readonly NUMBER_FLOOR_PX = 8;

  constructor() {
    // Re-fit whenever the text (content or length) or the card size changes.
    afterRenderEffect(() => {
      this.card().text;
      this.card().order;
      this.widthPx();
      this.fitCard();
    });
  }

  /** Fraction of the card height (0..1) the text area gets, ramped by label length. */
  private textFraction(length: number): number {
    const { SHORT_LEN, LONG_LEN, MIN_TEXT_FRACTION, MAX_TEXT_FRACTION } = TablePatternCardComponent;
    const t = Math.min(1, Math.max(0, (length - SHORT_LEN) / (LONG_LEN - SHORT_LEN)));
    return this.round2(MIN_TEXT_FRACTION + t * (MAX_TEXT_FRACTION - MIN_TEXT_FRACTION));
  }

  /**
   * Lay out the card: split the height between the number and the text by label
   * length, then shrink each element's font until its content fits its own box.
   * Applied imperatively so it doesn't fight a binding (and is an inert no-op where
   * the DOM isn't laid out, e.g. tests, where measurements read 0).
   */
  private fitCard(): void {
    const text = this.textRef()?.nativeElement;
    const order = this.orderRef()?.nativeElement;
    const width = this.widthPx();
    if (!text || !order || width <= 0) return;

    const textFraction = this.textFraction(this.card().text.length);
    text.style.flexGrow = `${textFraction}`;
    order.style.flexGrow = `${this.round2(1 - textFraction)}`;

    // Measured after the flex ratios apply (reading scrollHeight forces the reflow).
    this.fitFont(text, Math.round(width * 0.16), TablePatternCardComponent.TEXT_FLOOR_PX);
    this.fitFont(order, Math.round(width * 0.55), TablePatternCardComponent.NUMBER_FLOOR_PX);
  }

  /** Shrink `el`'s font 1px at a time from `max` down to `floor` until it fits its box. */
  private fitFont(el: HTMLElement, max: number, floor: number): void {
    let size = Math.max(floor, max);
    el.style.fontSize = `${size}px`;
    while (size > floor && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
      size -= 1;
      el.style.fontSize = `${size}px`;
    }
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
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

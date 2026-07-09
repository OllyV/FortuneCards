import { Component, computed, input, output } from '@angular/core';
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

  readonly cardSelect = output<void>();
  /** New top-left in % of table width; parent is responsible for clamping. */
  readonly cardMove = output<{ x: number; y: number }>();
  /** New absolute rotation in degrees; parent is responsible for normalizing. */
  readonly cardRotate = output<number>();
  readonly textChange = output<string>();

  readonly leftPx = computed(() => (this.card().x / 100) * this.tableWidthPx());
  readonly topPx = computed(() => (this.card().y / 100) * this.tableWidthPx());
  readonly widthPx = computed(() => (this.widthPercent() / 100) * this.tableWidthPx());

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

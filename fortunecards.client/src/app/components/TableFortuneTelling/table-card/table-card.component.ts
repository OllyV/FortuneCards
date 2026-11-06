import { Component, computed, effect, input, output, signal } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';
import { TableDeckCard } from '../../../models/table';
import { getDeckGradientStyle } from '../../../utils/deck-colors';

@Component({
  selector: 'table-card',
  standalone: true,
  imports: [TranslocoDirective],
  templateUrl: './table-card.component.html',
  styleUrl: './table-card.component.css',
})
export class TableCardComponent {
  readonly card = input.required<TableDeckCard>();
  /** Card width as % of table width. */
  readonly widthPercent = input.required<number>();
  readonly tableWidthPx = input.required<number>();
  readonly selected = input(false);
  readonly pickMode = input(false);

  readonly cardSelect = output<void>();
  readonly cardFlip = output<void>();
  /** New top-left in % of table width; parent is responsible for clamping. */
  readonly cardMove = output<{ x: number; y: number }>();
  /** New absolute rotation in degrees; parent is responsible for normalizing. */
  readonly cardRotate = output<number>();
  readonly cardInfo = output<void>();
  readonly cardPick = output<void>();

  readonly leftPx = computed(() => (this.card().x / 100) * this.tableWidthPx());
  readonly topPx = computed(() => (this.card().y / 100) * this.tableWidthPx());
  readonly widthPx = computed(() => (this.widthPercent() / 100) * this.tableWidthPx());
  readonly backStyle = computed(() =>
    this.card().backImageUrl ? '' : getDeckGradientStyle(this.card().colorIndex)
  );

  // Defer loading the (per-card, unique) front image until the card is first flipped
  // face-up. Latches true and stays true, so re-flipping never re-inserts the <img>;
  // the browser serves it from cache. A face-down card the user never flips loads nothing.
  readonly revealed = signal(false);

  constructor() {
    effect(() => {
      if (this.card().flipped) this.revealed.set(true);
    });
  }

  private dragging = false;
  private rotating = false;
  private moved = false;
  private startPointerX = 0;
  private startPointerY = 0;
  private startCardX = 0;
  private startCardY = 0;
  private centerX = 0;
  private centerY = 0;
  private startAngle = 0;
  private startRotation = 0;
  /** Timestamp (ms) of the last clean tap, for double-tap flip detection; 0 = none pending. */
  private lastTapTime = 0;
  /** Max gap between two taps to count as a double-tap. */
  private readonly doubleTapMs = 300;
  /** Pointer travel (px) beyond which a press counts as a drag, not a tap. */
  private readonly tapSlopPx = 6;

  onPointerDown(event: PointerEvent): void {
    if (this.pickMode()) {
      this.cardPick.emit();
      return;
    }
    this.cardSelect.emit();
    this.dragging = true;
    this.moved = false;
    this.startPointerX = event.clientX;
    this.startPointerY = event.clientY;
    this.startCardX = this.card().x;
    this.startCardY = this.card().y;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.rotating) {
      this.cardRotate.emit(this.startRotation + (this.pointerAngle(event) - this.startAngle));
      return;
    }
    if (!this.dragging) return;
    if (!this.moved && Math.hypot(event.clientX - this.startPointerX, event.clientY - this.startPointerY) > this.tapSlopPx) {
      this.moved = true;
    }
    const width = this.tableWidthPx();
    if (width <= 0) return;
    const dx = ((event.clientX - this.startPointerX) / width) * 100;
    const dy = ((event.clientY - this.startPointerY) / width) * 100;
    this.cardMove.emit({ x: this.startCardX + dx, y: this.startCardY + dy });
  }

  onPointerUp(): void {
    // A clean tap (no drag, not rotating) that follows another within the window flips the
    // card. Using pointer events (not `dblclick`) means this works for touch too — iOS Safari
    // doesn't fire `dblclick` from a double-tap, which is why flipping was broken on iPad.
    const wasTap = this.dragging && !this.moved && !this.rotating;
    this.dragging = false;
    this.rotating = false;
    if (!wasTap) {
      this.lastTapTime = 0;
      return;
    }
    const now = Date.now();
    if (this.lastTapTime > 0 && now - this.lastTapTime <= this.doubleTapMs) {
      this.cardFlip.emit();
      this.lastTapTime = 0;
    } else {
      this.lastTapTime = now;
    }
  }

  onPointerCancel(): void {
    this.dragging = false;
    this.rotating = false;
    this.lastTapTime = 0;
  }

  onRotateStart(event: PointerEvent): void {
    event.stopPropagation();
    this.rotating = true;
    this.dragging = false;
    const rect = (event.currentTarget as HTMLElement).closest('.table-card')!.getBoundingClientRect();
    this.centerX = rect.left + rect.width / 2;
    this.centerY = rect.top + rect.height / 2;
    this.startAngle = this.pointerAngle(event);
    this.startRotation = this.card().rotation;
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  onInfoClick(event: PointerEvent): void {
    event.stopPropagation();
    this.cardInfo.emit();
  }

  private pointerAngle(event: PointerEvent): number {
    return (Math.atan2(event.clientY - this.centerY, event.clientX - this.centerX) * 180) / Math.PI;
  }
}

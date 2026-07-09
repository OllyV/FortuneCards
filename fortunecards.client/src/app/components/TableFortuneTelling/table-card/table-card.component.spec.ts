import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TableCardComponent } from './table-card.component';
import { TableDeckCard } from '../../../models/table';

describe('TableCardComponent', () => {
  let fixture: ComponentFixture<TableCardComponent>;

  const baseCard: TableDeckCard = { kind: 'deck', id: 'c1', x: 10, y: 20, rotation: 0, flipped: false };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TableCardComponent);
    fixture.componentRef.setInput('card', baseCard);
    fixture.componentRef.setInput('widthPercent', 20);
    fixture.componentRef.setInput('tableWidthPx', 1000);
    fixture.componentRef.setInput('selected', false);
    fixture.detectChanges();
  });

  function root(): HTMLElement {
    return fixture.nativeElement.querySelector('.table-card');
  }

  it('renders back and front faces with placeholder text', () => {
    expect(root().querySelector('.face.back')!.textContent).toContain('back');
    expect(root().querySelector('.face.front')!.textContent).toContain('front');
  });

  it('derives pixel position and size from % of table width', () => {
    // x=10% of 1000px, y=20% of 1000px, width=20% of 1000px
    expect(root().style.left).toBe('100px');
    expect(root().style.top).toBe('200px');
    expect(root().style.width).toBe('200px');
  });

  it('applies the rotation as a CSS transform', () => {
    fixture.componentRef.setInput('card', { ...baseCard, rotation: 45 });
    fixture.detectChanges();
    expect(root().style.transform).toBe('rotate(45deg)');
  });

  it('toggles the flipped class from card state', () => {
    expect(root().querySelector('.flip-inner')!.classList.contains('flipped')).toBe(false);
    fixture.componentRef.setInput('card', { ...baseCard, flipped: true });
    fixture.detectChanges();
    expect(root().querySelector('.flip-inner')!.classList.contains('flipped')).toBe(true);
  });

  it('shows the rotate handle and selected class only when selected', () => {
    expect(root().classList.contains('selected')).toBe(false);
    expect(root().querySelector('.rotate-handle')).toBeNull();
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    expect(root().classList.contains('selected')).toBe(true);
    expect(root().querySelector('.rotate-handle')).not.toBeNull();
  });

  it('emits cardSelect on pointerdown', () => {
    const selected = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    expect(selected).toHaveBeenCalledTimes(1);
  });

  it('emits cardFlip on double click', () => {
    const flipped = vi.fn();
    fixture.componentInstance.cardFlip.subscribe(flipped);
    root().dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    expect(flipped).toHaveBeenCalledTimes(1);
  });

  it('emits cardMove with pointer delta converted to % of table width', () => {
    const moved = vi.fn();
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    // +100px on a 1000px table = +10%; +50px = +5%. Card starts at x=10, y=20.
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(moved).toHaveBeenCalledWith({ x: 20, y: 25 });
  });

  it('stops emitting cardMove after pointerup', () => {
    const moved = vi.fn();
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointerup', { bubbles: true }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(moved).not.toHaveBeenCalled();
  });

  it('emits cardRotate while dragging the rotate handle', () => {
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    const rotated = vi.fn();
    fixture.componentInstance.cardRotate.subscribe(rotated);
    // Card rect: center at (200, 250).
    vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, width: 200, height: 300, right: 300, bottom: 400, x: 100, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    const handle = root().querySelector('.rotate-handle')!;
    // Start: pointer directly right of center → reference angle 0°.
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 250 }));
    // Move: pointer directly below center → +90° from start. Card rotation was 0 → emits 90.
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 350 }));
    expect(rotated).toHaveBeenCalledWith(90);
  });

  it('does not emit cardMove while rotating via the handle', () => {
    fixture.componentRef.setInput('selected', true);
    fixture.detectChanges();
    const moved = vi.fn();
    fixture.componentInstance.cardMove.subscribe(moved);
    const handle = root().querySelector('.rotate-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 250 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 310, clientY: 260 }));
    expect(moved).not.toHaveBeenCalled();
  });
});

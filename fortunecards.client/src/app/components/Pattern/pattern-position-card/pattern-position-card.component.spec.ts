import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PatternPositionCardComponent } from './pattern-position-card.component';
import { EditablePatternCard } from '../../../models/pattern';

describe('PatternPositionCardComponent', () => {
  let fixture: ComponentFixture<PatternPositionCardComponent>;

  const baseCard: EditablePatternCard = { id: 'p1', x: 10, y: 20, rotation: 0, text: 'Past', order: 1 };

  async function setup(card: EditablePatternCard = baseCard, selected = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PatternPositionCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternPositionCardComponent);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('widthPercent', 20);
    fixture.componentRef.setInput('tableWidthPx', 1000);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement.querySelector('.pattern-position-card');
  }

  it('renders the order number and derives pixel geometry from % of table width', async () => {
    await setup();
    expect(root().querySelector('.position-order')!.textContent).toContain('1');
    expect(root().style.left).toBe('100px');
    expect(root().style.top).toBe('200px');
    expect(root().style.width).toBe('200px');
  });

  it('emits cardSelect on pointerdown and cardMove on drag', async () => {
    await setup();
    const selected = vi.fn();
    const moved = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    fixture.componentInstance.cardMove.subscribe(moved);
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(selected).toHaveBeenCalledTimes(1);
    // +100px/1000px = +10%, +50px = +5%; card starts at x=10, y=20.
    expect(moved).toHaveBeenCalledWith({ x: 20, y: 25 });
  });

  it('emits cardRotate while dragging the rotate handle when selected', async () => {
    await setup(baseCard, true);
    const rotated = vi.fn();
    fixture.componentInstance.cardRotate.subscribe(rotated);
    vi.spyOn(root(), 'getBoundingClientRect').mockReturnValue({
      left: 100, top: 100, width: 200, height: 300, right: 300, bottom: 400, x: 100, y: 100,
      toJSON: () => ({}),
    } as DOMRect);
    const handle = root().querySelector('.rotate-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 300, clientY: 250 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 200, clientY: 350 }));
    expect(rotated).toHaveBeenCalledWith(90);
  });

  it('shows no rotate handle when not selected', async () => {
    await setup(baseCard, false);
    expect(root().querySelector('.rotate-handle')).toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TablePatternCardComponent } from './table-pattern-card.component';
import { TablePatternCard } from '../../../models/table';

describe('TablePatternCardComponent', () => {
  let fixture: ComponentFixture<TablePatternCardComponent>;

  const baseCard: TablePatternCard = {
    kind: 'pattern', id: 'p1', x: 10, y: 20, rotation: 0, text: 'Past', order: 1, locked: false,
  };

  async function setup(card: TablePatternCard = baseCard, selected = false): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [TablePatternCardComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TablePatternCardComponent);
    fixture.componentRef.setInput('card', card);
    fixture.componentRef.setInput('widthPercent', 20);
    fixture.componentRef.setInput('tableWidthPx', 1000);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
  }

  function root(): HTMLElement {
    return fixture.nativeElement.querySelector('.table-pattern-card');
  }

  it('renders the order number and text, and never a flip face', async () => {
    await setup();
    expect(root().querySelector('.pattern-order')!.textContent).toContain('1');
    expect((root().querySelector('.pattern-text') as HTMLInputElement).value).toBe('Past');
    expect(root().querySelector('.face')).toBeNull();
  });

  it('has no cardFlip output', async () => {
    await setup();
    expect('cardFlip' in fixture.componentInstance).toBe(false);
  });

  it('derives pixel position and size from % of table width', async () => {
    await setup();
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

  it('emits textChange when the text field is edited', async () => {
    await setup();
    const changed = vi.fn();
    fixture.componentInstance.textChange.subscribe(changed);
    const input = root().querySelector('.pattern-text') as HTMLInputElement;
    input.value = 'Future';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changed).toHaveBeenCalledWith('Future');
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

  it('when locked: no rotate handle, no cardSelect, no cardMove', async () => {
    await setup({ ...baseCard, locked: true }, true);
    const selected = vi.fn();
    const moved = vi.fn();
    fixture.componentInstance.cardSelect.subscribe(selected);
    fixture.componentInstance.cardMove.subscribe(moved);
    expect(root().querySelector('.rotate-handle')).toBeNull();
    root().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 300 }));
    root().dispatchEvent(new MouseEvent('pointermove', { bubbles: true, clientX: 600, clientY: 350 }));
    expect(selected).not.toHaveBeenCalled();
    expect(moved).not.toHaveBeenCalled();
  });
});

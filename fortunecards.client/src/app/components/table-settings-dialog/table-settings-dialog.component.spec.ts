import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TableSettingsDialogComponent } from './table-settings-dialog.component';

describe('TableSettingsDialogComponent', () => {
  let fixture: ComponentFixture<TableSettingsDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableSettingsDialogComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(TableSettingsDialogComponent);
    fixture.componentRef.setInput('color', 'beige');
    fixture.componentRef.setInput('cardSize', 20);
    fixture.detectChanges();
  });

  function swatches(): HTMLButtonElement[] {
    return Array.from(fixture.nativeElement.querySelectorAll('.swatch'));
  }

  it('renders the four color swatches with the current one active', () => {
    expect(swatches().map((s) => s.getAttribute('data-color'))).toEqual(['beige', 'pink', 'yellow', 'dark-red']);
    expect(swatches().filter((s) => s.classList.contains('active')).map((s) => s.getAttribute('data-color'))).toEqual(['beige']);
  });

  it('emits colorChange when a swatch is clicked', () => {
    const changed = vi.fn();
    fixture.componentInstance.colorChange.subscribe(changed);
    swatches().find((s) => s.getAttribute('data-color') === 'dark-red')!.click();
    expect(changed).toHaveBeenCalledWith('dark-red');
  });

  it('shows the card size as % of table width with 5–80 slider bounds', () => {
    const slider: HTMLInputElement = fixture.nativeElement.querySelector('input[type="range"]');
    expect(slider.min).toBe('5');
    expect(slider.max).toBe('80');
    expect(slider.value).toBe('20');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('20% of table width');
  });

  it('emits cardSizeChange on slider input, clamped to 5–80', () => {
    const changed = vi.fn();
    fixture.componentInstance.cardSizeChange.subscribe(changed);
    const slider: HTMLInputElement = fixture.nativeElement.querySelector('input[type="range"]');
    slider.value = '55';
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changed).toHaveBeenCalledWith(55);
    fixture.componentInstance.onSizeInput({ target: { value: '999' } } as unknown as Event);
    expect(changed).toHaveBeenCalledWith(80);
    fixture.componentInstance.onSizeInput({ target: { value: '1' } } as unknown as Event);
    expect(changed).toHaveBeenCalledWith(5);
  });

  it('emits closed from the backdrop and the close button', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (fixture.nativeElement.querySelector('.dialog-backdrop') as HTMLElement).click();
    (fixture.nativeElement.querySelector('.dialog-close') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(2);
  });
});

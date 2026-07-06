import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { TableCardComponent } from './table-card.component';
import { TableCardState } from '../../models/table';

describe('TableCardComponent', () => {
  let fixture: ComponentFixture<TableCardComponent>;

  const baseCard: TableCardState = { id: 'c1', x: 10, y: 20, rotation: 0, flipped: false };

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
});

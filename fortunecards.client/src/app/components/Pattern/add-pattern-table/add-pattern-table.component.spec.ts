import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { AddPatternTableComponent } from './add-pattern-table.component';
import { EditablePatternCard } from '../../../models/pattern';

describe('AddPatternTableComponent', () => {
  let fixture: ComponentFixture<AddPatternTableComponent>;

  const cards: EditablePatternCard[] = [
    { id: 'a', x: 5, y: 5, rotation: 0, text: 'Q1', order: 1 },
    { id: 'b', x: 30, y: 40, rotation: 0, text: 'Q2', order: 2 },
  ];

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [AddPatternTableComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(AddPatternTableComponent);
    fixture.componentRef.setInput('cards', cards);
    fixture.componentRef.setInput('cardSizePercent', 15);
    fixture.componentRef.setInput('tableHeightPercent', 60);
    fixture.componentRef.setInput('selectedId', null);
    fixture.detectChanges();
  }

  it('renders one position card per card', async () => {
    await setup();
    expect(fixture.nativeElement.querySelectorAll('.pattern-position-card').length).toBe(2);
  });

  it('emits cardSizeChange from the size range input', async () => {
    await setup();
    const changed = vi.fn();
    fixture.componentInstance.cardSizeChange.subscribe(changed);
    const range = fixture.nativeElement.querySelector('input[type="range"]') as HTMLInputElement;
    range.value = '25';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    expect(changed).toHaveBeenCalledWith(25);
  });

  it('increase raises the table height by the card size', async () => {
    await setup();
    const changed = vi.fn();
    fixture.componentInstance.tableHeightChange.subscribe(changed);
    (fixture.nativeElement.querySelector('.height-increase') as HTMLButtonElement).click();
    expect(changed).toHaveBeenCalledWith(75); // 60 + 15
  });

  it('decrease is floored at the minimum height that fits the lowest card', async () => {
    await setup();
    const changed = vi.fn();
    fixture.componentInstance.tableHeightChange.subscribe(changed);
    // lowest card b: y 40 + cardHeight (15 * 5/3 = 25) + 5 = 70 → decrease from 60 floors at 70.
    (fixture.nativeElement.querySelector('.height-decrease') as HTMLButtonElement).click();
    expect(changed).toHaveBeenCalledWith(70);
  });
});

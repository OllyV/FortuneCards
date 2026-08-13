import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PatternTableViewComponent } from './pattern-table-view.component';
import { EditablePatternCard } from '../../../models/pattern';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('PatternTableViewComponent', () => {
  let fixture: ComponentFixture<PatternTableViewComponent>;

  const cards: EditablePatternCard[] = [
    { id: 'a', text: 'One', order: 1, x: 10, y: 10, rotation: 0 },
    { id: 'b', text: 'Two', order: 2, x: 40, y: 30, rotation: 15 },
  ];

  async function setup(list: EditablePatternCard[] = cards): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [PatternTableViewComponent, getTranslocoTestingModule()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternTableViewComponent);
    fixture.componentRef.setInput('cards', list);
    fixture.componentRef.setInput('cardSizePercent', 15);
    fixture.componentRef.setInput('tableHeightPercent', 60);
    fixture.detectChanges();
  }

  it('renders one position card per input card', async () => {
    await setup();
    expect(fixture.nativeElement.querySelectorAll('pattern-position-card').length).toBe(2);
  });

  it('renders the cards in read-only mode (no rotate handles, default cursor)', async () => {
    await setup();
    // readonly cards never render a rotate handle regardless of selection.
    expect(fixture.nativeElement.querySelector('.rotate-handle')).toBeNull();
    const card = fixture.nativeElement.querySelector('.pattern-position-card') as HTMLElement;
    expect(card.classList.contains('readonly')).toBe(true);
  });

  it('renders an empty table when there are no cards', async () => {
    await setup([]);
    expect(fixture.nativeElement.querySelectorAll('pattern-position-card').length).toBe(0);
  });
});

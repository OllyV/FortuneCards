import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter, Routes } from '@angular/router';
import { of } from 'rxjs';
import { ActivatedRoute } from '@angular/router';
import { AddPatternCardsComponent } from './add-pattern-cards.component';
import { PatternService } from '../../../services/pattern.service';
import { Pattern } from '../../../models/pattern';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('AddPatternCardsComponent', () => {
  let fixture: ComponentFixture<AddPatternCardsComponent>;
  let component: AddPatternCardsComponent;

  const pattern: Pattern = {
    id: 3, name: 'P', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    isPublic: false, isOwner: true, isFavorite: false, cardSizePercent: 15, tableHeightPercent: 60,
    cards: [{ id: 1, text: 'Q1', order: 1, x: 5, y: 5, rotation: 0 }],
  };

  async function setup(): Promise<void> {
    const service = {
      getPattern: vi.fn().mockReturnValue(of(pattern)),
      updatePattern: vi.fn().mockReturnValue(of(pattern)),
      saveCards: vi.fn().mockReturnValue(of(pattern)),
    };
    const routes: Routes = [{ path: '**', component: AddPatternCardsComponent }];
    await TestBed.configureTestingModule({
      imports: [AddPatternCardsComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter(routes),
        { provide: PatternService, useValue: service },
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: { get: () => '3' } } } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(AddPatternCardsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('loads existing cards', async () => {
    await setup();
    expect(component.cards().length).toBe(1);
    expect(component.cards()[0].text).toBe('Q1');
  });

  it('addQuestion appends a card and auto-numbers it', async () => {
    await setup();
    component.addQuestion();
    expect(component.cards().length).toBe(2);
    expect(component.cards()[1].order).toBe(2);
  });

  it('removeQuestion renumbers the remaining cards contiguously', async () => {
    await setup();
    component.addQuestion(); // order 2
    component.addQuestion(); // order 3
    component.removeQuestion(component.cards()[0].id);
    expect(component.cards().map((c) => c.order)).toEqual([1, 2]);
  });

  it('moveUp swaps order with the previous card', async () => {
    await setup();
    component.addQuestion();
    const secondId = component.cards()[1].id;
    component.moveUp(1);
    expect(component.cards()[0].id).toBe(secondId);
    expect(component.cards().map((c) => c.order)).toEqual([1, 2]);
  });

  it('setText updates a card by id', async () => {
    await setup();
    const id = component.cards()[0].id;
    component.setText(id, 'Changed');
    expect(component.cards()[0].text).toBe('Changed');
  });

  it('movePatternCard clamps x/y into the table bounds', async () => {
    await setup();
    const id = component.cards()[0].id;
    component.movePatternCard({ id, x: 999, y: -5 });
    const card = component.cards()[0];
    expect(card.x).toBe(85); // 100 - cardSize 15
    expect(card.y).toBe(0);
  });

  it('save sends renumbered cards and the layout settings', async () => {
    await setup();
    const service = TestBed.inject(PatternService);
    component.addQuestion();
    component.save();
    expect(service.saveCards).toHaveBeenCalledWith(3, [
      { text: 'Q1', order: 1, x: 5, y: 5, rotation: 0 },
      expect.objectContaining({ order: 2 }),
    ]);
    expect(service.updatePattern).toHaveBeenCalledWith(3, { cardSizePercent: 15, tableHeightPercent: 60 });
  });
});

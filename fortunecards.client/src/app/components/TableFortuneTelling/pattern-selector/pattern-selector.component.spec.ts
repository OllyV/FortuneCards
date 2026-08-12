import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { of } from 'rxjs';
import { PatternSelectorComponent } from './pattern-selector.component';
import { PatternService } from '../../../services/pattern.service';
import { AuthService } from '../../../services/auth.service';
import { Pattern } from '../../../models/pattern';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function pattern(id: number): Pattern {
  return {
    id, name: `P${id}`, description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    isPublic: true, isOwner: true, isFavorite: false, cardSizePercent: 15, tableHeightPercent: 60,
  };
}

describe('PatternSelectorComponent', () => {
  let fixture: ComponentFixture<PatternSelectorComponent>;

  async function setup(loggedIn: boolean): Promise<{ service: any }> {
    const service = {
      getMyPatterns: vi.fn().mockReturnValue(of([pattern(1)])),
      getPublicPatterns: vi.fn().mockReturnValue(of({ items: [pattern(2)], totalCount: 1, page: 1, pageSize: 12 })),
      getPattern: vi.fn().mockReturnValue(of(pattern(1))),
    };
    await TestBed.configureTestingModule({
      imports: [PatternSelectorComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        { provide: PatternService, useValue: service },
        { provide: AuthService, useValue: { currentUser: signal(loggedIn ? { id: 1 } : null) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternSelectorComponent);
    fixture.detectChanges();
    return { service };
  }

  it('loads my patterns when authorized', async () => {
    const { service } = await setup(true);
    expect(service.getMyPatterns).toHaveBeenCalled();
    expect(fixture.componentInstance.patterns().length).toBe(1);
  });

  it('emits the full pattern on select', async () => {
    await setup(true);
    const selected = vi.fn();
    fixture.componentInstance.patternSelected.subscribe(selected);
    fixture.componentInstance.selectPattern(pattern(1));
    expect(selected).toHaveBeenCalledWith(pattern(1));
  });
});

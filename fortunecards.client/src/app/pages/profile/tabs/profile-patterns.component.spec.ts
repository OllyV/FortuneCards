import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { RouterModule } from '@angular/router';
import { of } from 'rxjs';
import { ProfilePatternsComponent } from './profile-patterns.component';
import { PatternService } from '../../../services/pattern.service';
import { Pattern } from '../../../models/pattern';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

function pattern(over: Partial<Pattern>): Pattern {
  return {
    id: 1, name: 'P', description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    isPublic: false, isOwner: false, isFavorite: false, cardSizePercent: 15, tableHeightPercent: 60, cards: [], ...over,
  };
}

function render(svc: Partial<PatternService>) {
  TestBed.configureTestingModule({
    imports: [ProfilePatternsComponent, RouterModule.forRoot([]), getTranslocoTestingModule()],
    providers: [provideZonelessChangeDetection(), { provide: PatternService, useValue: svc }],
  });
  const fixture = TestBed.createComponent(ProfilePatternsComponent);
  fixture.detectChanges();
  return fixture;
}

describe('ProfilePatternsComponent', () => {
  it('keeps only owned patterns and renders a card each plus the add-tile', () => {
    const fixture = render({
      getMyPatterns: vi.fn(() => of([pattern({ id: 1, isOwner: true }), pattern({ id: 2, isFavorite: true })])),
    });
    expect(fixture.componentInstance.patterns().map((p) => p.id)).toEqual([1]);
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.card').length).toBe(1);
    expect(el.querySelector('.add')).not.toBeNull();
  });

  it('shows the empty state when there are no owned patterns', () => {
    const fixture = render({ getMyPatterns: vi.fn(() => of([])) });
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelectorAll('.card').length).toBe(0);
    expect(el.querySelector('.add')).not.toBeNull();
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { ActivatedRoute } from '@angular/router';
import { of } from 'rxjs';
import { PatternListComponent } from './pattern-list.component';
import { PatternService } from '../../../services/pattern.service';
import { AuthService } from '../../../services/auth.service';
import { Pattern } from '../../../models/pattern';

function pattern(id: number, over: Partial<Pattern> = {}): Pattern {
  return {
    id, name: `P${id}`, description: null, createdAt: '', emoji: '🔮', colorIndex: 0,
    isPublic: true, isOwner: true, isFavorite: false, cardSizePercent: 15, tableHeightPercent: 60, ...over,
  };
}

describe('PatternListComponent (mine)', () => {
  let fixture: ComponentFixture<PatternListComponent>;

  async function setup(): Promise<{ service: any }> {
    const service = {
      getMyPatterns: vi.fn().mockReturnValue(of([pattern(1, { isFavorite: true })])),
      getPublicPatterns: vi.fn(),
      addFavorite: vi.fn().mockReturnValue(of(void 0)),
      removeFavorite: vi.fn().mockReturnValue(of(void 0)),
    };
    await TestBed.configureTestingModule({
      imports: [PatternListComponent],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: PatternService, useValue: service },
        { provide: AuthService, useValue: { currentUser: signal({ id: 1, displayName: 'Test User', email: 'test@example.com' }), isLoggedIn: () => true } },
        { provide: ActivatedRoute, useValue: { data: of({ mode: 'mine' }) } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternListComponent);
    fixture.detectChanges();
    return { service };
  }

  it('loads my patterns', async () => {
    await setup();
    expect(fixture.componentInstance.patterns().length).toBe(1);
  });

  it('toggleFavorite flips state and calls the service', async () => {
    const { service } = await setup();
    const p = fixture.componentInstance.patterns()[0];
    fixture.componentInstance.toggleFavorite(p, new Event('click'));
    expect(service.removeFavorite).toHaveBeenCalledWith(1);
    expect(fixture.componentInstance.patterns()[0].isFavorite).toBe(false);
  });

  it('links each pattern card to its detail page', async () => {
    await setup();
    const anchor = fixture.nativeElement.querySelector('.pattern-card') as HTMLAnchorElement;
    expect(anchor.getAttribute('href')).toBe('/patterns/1');
  });

  it('shows the error state and retries when "Try again" is clicked', async () => {
    const { service } = await setup();
    service.getMyPatterns.mockReturnValueOnce(of([])); // ensure a clean reload result
    // Force an error state, then verify retry re-invokes the loader.
    fixture.componentInstance.error.set('Failed to load patterns.');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-error-state')).not.toBeNull();
    const spy = vi.spyOn(fixture.componentInstance, 'load');
    (fixture.nativeElement.querySelector('app-error-state button') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });
});

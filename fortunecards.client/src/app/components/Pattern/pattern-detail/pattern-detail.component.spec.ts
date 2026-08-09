import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { of, throwError } from 'rxjs';
import { CommonModule } from '@angular/common';
import { PatternDetailComponent } from './pattern-detail.component';
import { Pattern } from '../../../models/pattern';
import { AuthService } from '../../../services/auth.service';
import { PatternService } from '../../../services/pattern.service';

const mockPattern: Pattern = {
  id: 1, name: 'Celtic Cross', description: 'Ten positions', createdAt: '2026-01-01',
  emoji: '🔮', colorIndex: 0, isPublic: true, isOwner: false, isFavorite: false,
  cardSizePercent: 15, tableHeightPercent: 60,
  cards: [
    { id: 5, text: 'Present', order: 1, x: 10, y: 10, rotation: 0 },
    { id: 6, text: 'Challenge', order: 2, x: 30, y: 20, rotation: 90 },
  ],
};

describe('PatternDetailComponent', () => {
  let component: PatternDetailComponent;
  let fixture: ComponentFixture<PatternDetailComponent>;
  let service: { getPattern: any; addFavorite: any; removeFavorite: any };

  async function setup(getPattern = of(mockPattern)): Promise<void> {
    service = {
      getPattern: vi.fn(() => getPattern),
      addFavorite: vi.fn(() => of(void 0)),
      removeFavorite: vi.fn(() => of(void 0)),
    };
    await TestBed.configureTestingModule({
      imports: [PatternDetailComponent, CommonModule, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ActivatedRoute, useValue: { params: of({ id: '1' }) } },
        { provide: AuthService, useValue: { isLoggedIn: () => true, currentUser: signal({ id: 2, displayName: 'U', email: 'u@e.com', avatarUrl: null }) } },
        { provide: PatternService, useValue: service },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PatternDetailComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }

  it('loads the pattern and renders its questions', async () => {
    await setup();
    expect(component.pattern()!.name).toBe('Celtic Cross');
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Present');
    expect(text).toContain('Challenge');
  });

  it('maps pattern cards to editable-shaped table cards with string ids', async () => {
    await setup();
    expect(component.tableCards()).toEqual([
      { id: '5', text: 'Present', order: 1, x: 10, y: 10, rotation: 0 },
      { id: '6', text: 'Challenge', order: 2, x: 30, y: 20, rotation: 90 },
    ]);
  });

  it('renders the pattern-table-view', async () => {
    await setup();
    expect(fixture.nativeElement.querySelector('app-pattern-table-view')).not.toBeNull();
  });

  it('shows the page-end Edit button only to the owner', async () => {
    await setup(of({ ...mockPattern, isOwner: true }));
    expect(fixture.nativeElement.querySelector('.edit-cta')).not.toBeNull();
  });

  it('hides the page-end Edit button for a non-owner', async () => {
    await setup(of({ ...mockPattern, isOwner: false }));
    expect(fixture.nativeElement.querySelector('.edit-cta')).toBeNull();
  });

  it('usePattern navigates to the table with the pattern query param', async () => {
    await setup();
    const nav = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.usePattern();
    expect(nav).toHaveBeenCalledWith(['/table'], { queryParams: { pattern: 1 } });
  });

  it('editPattern and editQuestions navigate to the right routes', async () => {
    await setup(of({ ...mockPattern, isOwner: true }));
    const nav = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.editPattern();
    expect(nav).toHaveBeenCalledWith(['/patterns', 1, 'edit']);
    component.editQuestions();
    expect(nav).toHaveBeenCalledWith(['/patterns', 1, 'cards']);
  });

  it('goBack returns to /patterns/mine for an owner and /patterns/search otherwise', async () => {
    await setup(of({ ...mockPattern, isOwner: true }));
    const nav = vi.spyOn(component['router'], 'navigate').mockResolvedValue(true);
    component.goBack();
    expect(nav).toHaveBeenCalledWith(['/patterns/mine']);
    component.pattern.set({ ...mockPattern, isOwner: false });
    component.goBack();
    expect(nav).toHaveBeenCalledWith(['/patterns/search']);
  });

  it('toggleFavorite flips isFavorite and calls the service', async () => {
    await setup(of({ ...mockPattern, isOwner: false, isFavorite: false }));
    component.toggleFavorite();
    expect(component.pattern()!.isFavorite).toBe(true);
    expect(service.addFavorite).toHaveBeenCalledWith(1);
  });

  it('reverts the favourite on service error', async () => {
    await setup(of({ ...mockPattern, isOwner: false, isFavorite: false }));
    service.addFavorite = vi.fn(() => throwError(() => new Error('nope')));
    component.toggleFavorite();
    expect(component.pattern()!.isFavorite).toBe(false);
  });

  it('shows an error state when the pattern fails to load', async () => {
    await setup(throwError(() => new Error('boom')));
    expect(component.error()).toBe('Failed to load pattern.');
    expect(fixture.nativeElement.querySelector('.state-error')).not.toBeNull();
  });
});

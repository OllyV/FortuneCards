import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { CardInfoDialogComponent } from './card-info-dialog.component';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('CardInfoDialogComponent', () => {
  let fixture: ComponentFixture<CardInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardInfoDialogComponent, getTranslocoTestingModule()],
      providers: [
        provideZonelessChangeDetection(),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(CardInfoDialogComponent);
    fixture.componentRef.setInput('imageUrl', '/images/front.png');
    fixture.componentRef.setInput('title', 'The Sun');
    fixture.componentRef.setInput('description', 'A bright card.');
    fixture.detectChanges();
  });

  function el(): HTMLElement {
    return fixture.nativeElement;
  }

  it('renders the picture, title and description', () => {
    const img = el().querySelector('.card-info-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('/images/front.png');
    expect(el().querySelector('.card-info-title')!.textContent).toContain('The Sun');
    expect(el().querySelector('.card-info-description')!.textContent).toContain('A bright card.');
  });

  it('emits closed when the backdrop is clicked', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (el().querySelector('.dialog-backdrop') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('emits closed when the Close button is clicked', () => {
    const closed = vi.fn();
    fixture.componentInstance.closed.subscribe(closed);
    (el().querySelector('.dialog-close') as HTMLElement).click();
    expect(closed).toHaveBeenCalledTimes(1);
  });

  it('shows no comments section until a cardId is provided', () => {
    // Default beforeEach sets no cardId.
    expect(el().querySelector('comments-section')).toBeNull();
  });

  it('renders the card comments section when cardId is set', () => {
    const httpMock = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('cardId', 9);
    fixture.detectChanges();

    expect(el().querySelector('comments-section')).not.toBeNull();
    const req = httpMock.expectOne((r) => r.url === '/api/comments');
    expect(req.request.params.get('targetType')).toBe('1'); // CommentTargetType.Card
    expect(req.request.params.get('targetId')).toBe('9');
    req.flush({ items: [], totalCount: 0, page: 1, pageSize: 20 });
  });
});

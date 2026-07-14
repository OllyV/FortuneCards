import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { CardInfoDialogComponent } from './card-info-dialog.component';

describe('CardInfoDialogComponent', () => {
  let fixture: ComponentFixture<CardInfoDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardInfoDialogComponent],
      providers: [provideZonelessChangeDetection()],
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
});

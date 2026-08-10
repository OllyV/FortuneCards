import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';
import { SkeletonCardGridComponent } from './skeleton-card-grid.component';
import { SkeletonDetailComponent } from './skeleton-detail.component';

describe('Skeleton components', () => {
  it('SkeletonComponent renders a shimmer box with the given dimensions', async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture: ComponentFixture<SkeletonComponent> = TestBed.createComponent(SkeletonComponent);
    fixture.componentRef.setInput('width', '50%');
    fixture.componentRef.setInput('height', '20px');
    fixture.detectChanges();
    const box = fixture.nativeElement.querySelector('.skeleton') as HTMLElement;
    expect(box).not.toBeNull();
    expect(box.style.width).toBe('50%');
    expect(box.style.height).toBe('20px');
  });

  it('SkeletonCardGridComponent renders `count` tiles', async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonCardGridComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SkeletonCardGridComponent);
    fixture.componentRef.setInput('count', 5);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-skeleton').length).toBe(5);
  });

  it('SkeletonDetailComponent renders a hero bar and a large block', async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonDetailComponent],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    const fixture = TestBed.createComponent(SkeletonDetailComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-skeleton').length).toBeGreaterThanOrEqual(2);
  });
});

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { PaginationComponent } from './pagination.component';

describe('PaginationComponent', () => {
  let fixture: ComponentFixture<PaginationComponent>;

  function setup(page: number, totalCount: number, pageSize = 20) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      imports: [PaginationComponent],
      providers: [provideZonelessChangeDetection()],
    });
    fixture = TestBed.createComponent(PaginationComponent);
    fixture.componentRef.setInput('page', page);
    fixture.componentRef.setInput('pageSize', pageSize);
    fixture.componentRef.setInput('totalCount', totalCount);
    fixture.detectChanges();
  }

  it('computes total pages by ceil(total / pageSize)', () => {
    setup(1, 45, 20);
    expect(fixture.componentInstance.totalPages()).toBe(3);
  });

  it('disables prev on first page and next on last page', () => {
    setup(1, 45, 20);
    expect(fixture.componentInstance.canPrev()).toBe(false);
    expect(fixture.componentInstance.canNext()).toBe(true);
    setup(3, 45, 20);
    expect(fixture.componentInstance.canPrev()).toBe(true);
    expect(fixture.componentInstance.canNext()).toBe(false);
  });

  it('emits the next/prev page number', () => {
    setup(2, 45, 20);
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
    fixture.componentInstance.next();
    fixture.componentInstance.prev();
    expect(emitted).toEqual([3, 1]);
  });

  it('does not emit past the boundaries', () => {
    setup(1, 45, 20);
    const emitted: number[] = [];
    fixture.componentInstance.pageChange.subscribe((p) => emitted.push(p));
    fixture.componentInstance.prev();
    expect(emitted).toEqual([]);
  });
});

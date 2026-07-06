import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { RouterModule } from '@angular/router';
import { TableComponent } from './table.component';
import { AuthService } from '../../services/auth.service';

describe('TableComponent', () => {
  let component: TableComponent;
  let fixture: ComponentFixture<TableComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TableComponent, RouterModule.forRoot([])],
      providers: [
        provideZonelessChangeDetection(),
        { provide: AuthService, useValue: { isLoggedIn: signal(false), currentUser: signal(null), login: vi.fn(), logout: vi.fn() } },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(TableComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  function tableEl(): HTMLElement {
    return fixture.nativeElement.querySelector('.table');
  }

  it('has spec defaults: beige, 20% cards, one test card, nothing selected', () => {
    expect(component.tableColor()).toBe('beige');
    expect(component.cardSizePercent()).toBe(20);
    expect(component.cards()).toEqual([{ id: 'test-card', x: 0, y: 0, rotation: 0, flipped: false }]);
    expect(component.selectedCardId()).toBeNull();
  });

  it('renders the table with its color and one table-card', () => {
    expect(tableEl().getAttribute('data-color')).toBe('beige');
    expect(fixture.nativeElement.querySelectorAll('table-card').length).toBe(1);
  });

  it('falls back to 100vh height before the table is measured', () => {
    expect(component.heightStyle()).toBe('100vh');
  });

  it('derives pixel height from tableHeightPercent and tableWidthPx', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    expect(component.heightStyle()).toBe('600px');
  });

  it('selectCard selects; pointerdown on the table background deselects', () => {
    component.selectCard('test-card');
    expect(component.selectedCardId()).toBe('test-card');
    fixture.detectChanges();
    tableEl().dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(component.selectedCardId()).toBeNull();
  });

  it('pointerdown bubbling from a child does not deselect', () => {
    component.selectCard('test-card');
    fixture.detectChanges();
    const child = fixture.nativeElement.querySelector('table-card')!;
    child.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(component.selectedCardId()).toBe('test-card');
  });

  it('flipCard toggles the flipped flag', () => {
    component.flipCard('test-card');
    expect(component.cards()[0].flipped).toBe(true);
    component.flipCard('test-card');
    expect(component.cards()[0].flipped).toBe(false);
  });

  it('moveCard clamps the card inside the table', () => {
    component.tableWidthPx.set(1000);
    component.tableHeightPercent.set(60);
    // card is 20% wide, 30% tall (aspect 2/3) → max x = 80, max y = 30
    component.moveCard('test-card', { x: 95, y: 95 });
    expect(component.cards()[0]).toMatchObject({ x: 80, y: 30 });
    component.moveCard('test-card', { x: -10, y: -10 });
    expect(component.cards()[0]).toMatchObject({ x: 0, y: 0 });
  });

  it('rotateCard normalizes the angle into [0, 360)', () => {
    component.rotateCard('test-card', 370);
    expect(component.cards()[0].rotation).toBe(10);
    component.rotateCard('test-card', -10);
    expect(component.cards()[0].rotation).toBe(350);
  });

  function key(type: 'keydown' | 'keyup', key: string): void {
    document.dispatchEvent(new KeyboardEvent(type, { key, bubbles: true }));
  }

  it('rotates the selected card 1° per arrow keydown while R is held', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(2);
    key('keydown', 'ArrowLeft');
    expect(component.cards()[0].rotation).toBe(1);
  });

  it('ignores arrows when R is not held', () => {
    component.selectCard('test-card');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('stops rotating after R is released', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    key('keyup', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('ignores R+arrows when no card is selected', () => {
    key('keydown', 'r');
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });

  it('resets the held R flag when the window loses focus', () => {
    component.selectCard('test-card');
    key('keydown', 'r');
    window.dispatchEvent(new Event('blur'));
    key('keydown', 'ArrowRight');
    expect(component.cards()[0].rotation).toBe(0);
  });
});

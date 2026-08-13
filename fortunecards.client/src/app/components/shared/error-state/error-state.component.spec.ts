import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { ErrorStateComponent } from './error-state.component';
import { getTranslocoTestingModule } from '../../../../testing/transloco-testing';

describe('ErrorStateComponent', () => {
  let fixture: ComponentFixture<ErrorStateComponent>;

  async function setup(): Promise<void> {
    await TestBed.configureTestingModule({
      imports: [ErrorStateComponent, getTranslocoTestingModule()],
      providers: [provideZonelessChangeDetection()],
    }).compileComponents();
    fixture = TestBed.createComponent(ErrorStateComponent);
    fixture.componentRef.setInput('message', 'Failed to load.');
    fixture.detectChanges();
  }

  it('renders the message', async () => {
    await setup();
    expect(fixture.nativeElement.textContent).toContain('Failed to load.');
  });

  it('emits retry when the button is clicked', async () => {
    await setup();
    const emit = vi.fn();
    fixture.componentInstance.retry.subscribe(emit);
    (fixture.nativeElement.querySelector('button') as HTMLButtonElement).click();
    expect(emit).toHaveBeenCalledTimes(1);
  });
});

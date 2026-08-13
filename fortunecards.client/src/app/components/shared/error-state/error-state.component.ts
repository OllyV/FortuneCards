import { Component, input, output } from '@angular/core';
import { TranslocoDirective } from '@jsverse/transloco';

@Component({
  selector: 'app-error-state',
  standalone: true,
  imports: [TranslocoDirective],
  template: `
    <div class="error-state" role="alert" *transloco="let t">
      <p class="error-message">{{ message() }}</p>
      <button type="button" class="btn-primary" (click)="retry.emit()">{{ t('common.retry') }}</button>
    </div>
  `,
  styleUrl: './error-state.component.css',
})
export class ErrorStateComponent {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}

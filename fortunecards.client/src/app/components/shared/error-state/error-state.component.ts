import { Component, input, output } from '@angular/core';

@Component({
  selector: 'app-error-state',
  standalone: true,
  template: `
    <div class="error-state" role="alert">
      <p class="error-message">{{ message() }}</p>
      <button type="button" class="btn-primary" (click)="retry.emit()">Try again</button>
    </div>
  `,
  styleUrl: './error-state.component.css',
})
export class ErrorStateComponent {
  readonly message = input.required<string>();
  readonly retry = output<void>();
}

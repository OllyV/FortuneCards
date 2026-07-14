import { Component, input, output } from '@angular/core';

@Component({
  selector: 'card-info-dialog',
  standalone: true,
  templateUrl: './card-info-dialog.component.html',
  styleUrl: './card-info-dialog.component.css',
})
export class CardInfoDialogComponent {
  readonly imageUrl = input.required<string>();
  readonly title = input.required<string>();
  readonly description = input.required<string>();

  readonly closed = output<void>();
}

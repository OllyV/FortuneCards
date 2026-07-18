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
  readonly aspectWidth = input(3);
  readonly aspectHeight = input(5);

  readonly closed = output<void>();
}

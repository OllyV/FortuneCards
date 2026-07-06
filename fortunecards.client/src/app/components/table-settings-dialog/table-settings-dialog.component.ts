import { Component, input, output } from '@angular/core';
import { TableColor } from '../../models/table';

@Component({
  selector: 'table-settings-dialog',
  standalone: true,
  templateUrl: './table-settings-dialog.component.html',
  styleUrl: './table-settings-dialog.component.css',
})
export class TableSettingsDialogComponent {
  readonly color = input.required<TableColor>();
  readonly cardSize = input.required<number>();

  readonly colorChange = output<TableColor>();
  readonly cardSizeChange = output<number>();
  readonly closed = output<void>();

  readonly colors: TableColor[] = ['beige', 'pink', 'yellow', 'dark-red'];

  onSizeInput(event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    if (Number.isNaN(value)) return;
    this.cardSizeChange.emit(Math.min(50, Math.max(5, value)));
  }
}

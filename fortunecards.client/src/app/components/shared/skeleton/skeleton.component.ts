import { Component, input } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  template: `<span class="skeleton" [style.width]="width()" [style.height]="height()" [style.borderRadius]="radius()"></span>`,
  styleUrl: './skeleton.component.css',
})
export class SkeletonComponent {
  readonly width = input('100%');
  readonly height = input('1rem');
  readonly radius = input('8px');
}

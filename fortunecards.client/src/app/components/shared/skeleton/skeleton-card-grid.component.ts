import { Component, computed, input } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-skeleton-card-grid',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div class="skeleton-grid" aria-hidden="true">
      @for (i of tiles(); track i) {
        <app-skeleton height="100%" radius="var(--radius-lg)" />
      }
    </div>
  `,
  styleUrl: './skeleton-card-grid.component.css',
})
export class SkeletonCardGridComponent {
  readonly count = input(8);
  readonly tiles = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}

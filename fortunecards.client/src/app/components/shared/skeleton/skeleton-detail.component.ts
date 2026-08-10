import { Component } from '@angular/core';
import { SkeletonComponent } from './skeleton.component';

@Component({
  selector: 'app-skeleton-detail',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div class="skeleton-detail" aria-hidden="true">
      <app-skeleton class="sk-hero" height="88px" radius="0" />
      <div class="sk-body">
        <app-skeleton width="40%" height="1.1rem" />
        <app-skeleton width="90%" height="1rem" />
        <app-skeleton width="80%" height="1rem" />
        <app-skeleton width="85%" height="1rem" />
        <app-skeleton class="sk-block" height="220px" radius="16px" />
      </div>
    </div>
  `,
  styleUrl: './skeleton-detail.component.css',
})
export class SkeletonDetailComponent {}

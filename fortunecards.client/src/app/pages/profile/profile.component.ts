import { Component, inject } from '@angular/core';
import { Router, RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { TranslocoDirective } from '@jsverse/transloco';
import { AuthService } from '../../services/auth.service';
import { NavigationBar } from '../../components/Navigation/navigation-bar/navigation-bar';

@Component({
  selector: 'app-profile',
  standalone: true,
  templateUrl: './profile.component.html',
  styleUrls: ['./profile.component.css'],
  imports: [NavigationBar, TranslocoDirective, RouterOutlet, RouterLink, RouterLinkActive],
})
export class ProfileComponent {
  protected readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  goBack(): void { this.router.navigate(['/decks']); }
}

import { ErrorHandler, Injectable, inject } from '@angular/core';
import { MonitoringService } from './services/monitoring.service';

@Injectable()
export class MonitoringErrorHandler implements ErrorHandler {
  private readonly monitoring = inject(MonitoringService);

  handleError(error: unknown): void {
    this.monitoring.trackException(error);
    console.error(error);
  }
}

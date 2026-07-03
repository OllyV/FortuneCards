import { Injectable } from '@angular/core';
import { ApplicationInsights } from '@microsoft/applicationinsights-web';

interface AppConfig {
  applicationInsightsConnectionString?: string;
}

@Injectable({ providedIn: 'root' })
export class MonitoringService {
  private appInsights: ApplicationInsights | null = null;

  /** Fetch the connection string from the backend and initialize. Never rejects. */
  async initFromConfig(): Promise<void> {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) return;
      const cfg = (await res.json()) as AppConfig;
      this.init(cfg.applicationInsightsConnectionString ?? '');
    } catch {
      // Monitoring is best-effort — never block or fail app startup.
    }
  }

  /** Initialize the SDK. No-op if there is no connection string or it is already initialized. */
  init(connectionString: string): void {
    if (!connectionString || this.appInsights) return;
    this.appInsights = new ApplicationInsights({
      config: {
        connectionString,
        enableAutoRouteTracking: true,
      },
    });
    this.appInsights.loadAppInsights();
    this.appInsights.trackPageView();
  }

  isInitialized(): boolean {
    return this.appInsights !== null;
  }

  trackException(error: unknown): void {
    this.appInsights?.trackException({
      exception: error instanceof Error ? error : new Error(String(error)),
    });
  }

  trackEvent(name: string, properties?: Record<string, unknown>): void {
    this.appInsights?.trackEvent({ name }, properties);
  }
}

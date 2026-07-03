import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { MonitoringService } from './monitoring.service';

describe('MonitoringService', () => {
  let service: MonitoringService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), MonitoringService],
    });
    service = TestBed.inject(MonitoringService);
  });

  it('does not throw when tracking before initialization', () => {
    expect(() => service.trackException(new Error('boom'))).not.toThrow();
    expect(() => service.trackEvent('test')).not.toThrow();
  });

  it('stays inactive when init is called with an empty connection string', () => {
    service.init('');
    expect(service.isInitialized()).toBe(false);
    expect(() => service.trackException(new Error('boom'))).not.toThrow();
  });
});

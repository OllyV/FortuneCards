import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { retry, timer } from 'rxjs';

/** Exponential backoff between GET retries, in ms. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];

/** Statuses that indicate a transient failure worth retrying (incl. cold start). */
const TRANSIENT_STATUSES = new Set([0, 408, 502, 503, 504]);

/**
 * Retries transient GET failures with exponential backoff so the app survives
 * backend cold starts. Non-GET requests and non-transient errors pass straight
 * through (no duplicated writes, no pointless waiting on real 4xx/500).
 */
export const retryInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET') return next(req);
  return next(req).pipe(
    retry({
      count: RETRY_DELAYS_MS.length,
      delay: (error, retryCount) => {
        if (!(error instanceof HttpErrorResponse) || !TRANSIENT_STATUSES.has(error.status)) {
          throw error;
        }
        return timer(RETRY_DELAYS_MS[retryCount - 1]);
      },
    }),
  );
};

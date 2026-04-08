import { inject, Inject, Injectable } from '@angular/core';
import { HttpErrorResponse, HttpEvent, HttpHandler, HttpInterceptor, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { catchError, switchMap } from 'rxjs/operators';
import { Observable, throwError } from 'rxjs';
import { JwtAuthService } from './jwt-auth.service';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { JwtAuthLogLevel } from './models/jwt-auth-log-level';
import { JwtTokenBase } from './models/jwt-token-base';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';

function applyCredentials(req: HttpRequest<any>, token?: string | null) {
  if (!token) return req;
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

export const jwtAuthInterceptorFn: HttpInterceptorFn = (req, next): Observable<HttpEvent<unknown>> => {
  const config = inject(JWT_AUTH_CONFIG) as JwtAuthConfig;
  const jwtAuth = inject<JwtAuthService<JwtTokenBase>>(JwtAuthService as any);

  if (config.logLevel <= JwtAuthLogLevel.VERBOSE) {
    // evita di loggare token/headers
    console.debug('JwtAuthInterceptor', req.url);
  }

  // non toccare le chiamate di autenticazione
  if (jwtAuth.isAuthenticationUrl(req.url)) {
    return next(req);
  }

  const authedReq = applyCredentials(req, jwtAuth.jwtToken?.accessToken);

  return next(authedReq).pipe(
    catchError((error: unknown) => {
      // solo HttpErrorResponse ci interessa
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      switch (error.status) {
        case 401: {
          if (jwtAuth.jwtToken != null && jwtAuth.isLoggedIn) {
            // refresh e retry con nuovo access token
            return jwtAuth.refreshToken().pipe(
              switchMap(t => next(applyCredentials(req, t.accessToken)))
            );
          }
          return throwError(() => error);
        }

        default:
          return throwError(() => error);
      }
    })
  );
};

@Injectable()
export class JwtAuthInterceptor implements HttpInterceptor {
  constructor(
    private readonly jwtAuth: JwtAuthService<JwtTokenBase>,
    @Inject(JWT_AUTH_CONFIG) private readonly config: JwtAuthConfig,
  ) {}

  intercept(req: HttpRequest<unknown>, next: HttpHandler): Observable<HttpEvent<unknown>> {
    if (this.config.logLevel <= JwtAuthLogLevel.VERBOSE) {
      console.debug('JwtAuthInterceptor', req.url);
    }

    if (this.jwtAuth.isAuthenticationUrl(req.url)) {
      return next.handle(req);
    }

    const authedReq = applyCredentials(req, this.jwtAuth.jwtToken?.accessToken);

    return next.handle(authedReq).pipe(
      catchError((error: unknown) => {
        if (!(error instanceof HttpErrorResponse)) {
          return throwError(() => error);
        }

        if (error.status === 401 && this.jwtAuth.jwtToken != null && this.jwtAuth.isLoggedIn) {
          return this.jwtAuth.refreshToken().pipe(
            switchMap(t => next.handle(applyCredentials(req, t.accessToken)))
          );
        }

        return throwError(() => error);
      })
    );
  }
}

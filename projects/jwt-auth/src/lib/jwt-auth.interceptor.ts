import { Observable, throwError } from 'rxjs';
import { Inject, Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { JwtAuthService } from './jwt-auth.service';
import { catchError, map, switchMap } from 'rxjs/operators';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { JwtAuthLogLevel } from './models/jwt-auth-log-level';
import { JwtTokenBase } from './models/jwt-token-base';
import { ERROR_INVALID_TOKEN, WWWAuthenticateMessageFactory } from './models/www-authenticate-message';

@Injectable()
export class JwtAuthInterceptor<Token extends JwtTokenBase> implements HttpInterceptor {

  constructor(
    @Inject(JWT_AUTH_CONFIG) private readonly _config: JwtAuthConfig,
    private readonly _jwtAuth: JwtAuthService<Token>
  ) { }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
      console.debug("JwtAuthInterceptor " + request.url);

    if (this._jwtAuth.isAuthenticationUrl(request.url)) {
      return <any>next.handle(request);
    }

    return <any>next.handle(this.applyCredentials(request, this._jwtAuth.jwtToken?.accessToken))
      .pipe(
        map((event: HttpEvent<any>) => {
          if (event instanceof HttpResponse) {
            return event;
          }
        }),
        catchError((error) => {
          if (error instanceof HttpErrorResponse) {
            switch ((<HttpErrorResponse>error).status) {
              // case 400:
              //     return this.handle400Error(error, request, next);
              case 401:
                if (this._jwtAuth.jwtToken != null && this._jwtAuth.isLoggedIn) {
                  return this.handle401Error(error, request, next);
                } else {
                  return throwError(error);
                }
              // case 500:
              //     console.error("500 error");
              //     console.error(error);
              //     return throwError(error);
              default:
                //     console.error(error);
                return throwError(error);
            }
          } else {
            return throwError(error);
          }
        })
      );
  }

  private applyCredentials(request: HttpRequest<any>, token: string) {
    if (token == null || token == '')
      return request;

    return request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
  }

  // private handle400Error(errorResponse: HttpErrorResponse, request: HttpRequest<any>, next: HttpHandler) {
  //     console.debug(errorResponse.error);
  //     if (errorResponse.error.error && errorResponse.error.error == "invalid_grant") {
  //         this._jwtAuth.logout();
  //         return throwError(errorResponse.error);
  //     }
  // }

  private handle401Error(errorResponse: HttpErrorResponse, request: HttpRequest<any>, next: HttpHandler) {
    const wwwAuthenticate = WWWAuthenticateMessageFactory.create(errorResponse.headers.get('WWW-Authenticate'));

    if (wwwAuthenticate.error == ERROR_INVALID_TOKEN) {
      return this._jwtAuth.refreshToken()
        .pipe(
          switchMap(x => next.handle(this.applyCredentials(request, x.accessToken)))
        );
    }else{
      return throwError(() => new Error(wwwAuthenticate.description + ' ' + wwwAuthenticate.description));
    }
  }
}

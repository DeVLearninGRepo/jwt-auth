import { Observable, throwError } from 'rxjs';
import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { JwtAuthService } from './jwt-auth.service';
import { catchError, concatMap, exhaustMap, map, mergeMap, switchMap } from 'rxjs/operators';
import { Utils } from './utils';

@Injectable()
export class JwtAuthInterceptor implements HttpInterceptor {

  constructor(
    private readonly _jwtAuth: JwtAuthService
  ) { }

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (this._jwtAuth.isAuthenticationUrl(request.url)) {
      return <any>next.handle(request);
    }

    let isInvalidToken = null;

    return <any>next.handle(this.applyCredentials(request, this._jwtAuth.jwtToken?.token))
      .pipe(
        map((event: HttpEvent<any>) => {
          if (event instanceof HttpResponse) {
            return event;
          }
        }),
        catchError((error) => {
          if (error instanceof HttpErrorResponse) {
            switch ((<HttpErrorResponse>error).status) {
              case 401:
                isInvalidToken = error.headers.get("invalid_token");
                if (Utils.isDefinedAndNotNull(isInvalidToken)) {
                  this._jwtAuth.logout();
                  return throwError(error);
                } else {
                  return this.handle401Error(error, request, next);
                }
              case 403:
                isInvalidToken = error.headers.get("invalid_token");
                if (Utils.isDefinedAndNotNull(isInvalidToken)) {
                  this._jwtAuth.logout();
                  return throwError(error);
                }
                break;
              default:
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
    return this._jwtAuth.refreshToken()
      .pipe(
        concatMap(x => {
          return next.handle(this.applyCredentials(request, x.token));
        })
      );
  }
}

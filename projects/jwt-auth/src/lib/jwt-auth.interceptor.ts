import { Observable, throwError } from 'rxjs';
import { Injectable } from '@angular/core';
import { HttpRequest, HttpHandler, HttpEvent, HttpInterceptor, HttpErrorResponse, HttpResponse } from '@angular/common/http';
import { JwtAuthService } from './jwt-auth.service';
import { catchError, map, switchMap } from 'rxjs/operators';

@Injectable()
export class JwtAuthInterceptor implements HttpInterceptor {

    constructor(
        private readonly _jwtAuth: JwtAuthService
    ) { }

    intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
        if (this._jwtAuth.isAuthenticationUrl(request.url)) {
            return <any>next.handle(request);
        }

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
                            case 400:
                                return this.handle400Error(error, request, next);
                            case 401:
                                return this.handle401Error(error, request, next);
                            case 500:
                                console.error("500 error");
                                console.error(error);
                                return throwError(error);
                            default:
                                console.error(error);
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

    private handle400Error(errorResponse: HttpErrorResponse, request: HttpRequest<any>, next: HttpHandler) {
        console.debug(errorResponse.error);
        if (errorResponse.error.error && errorResponse.error.error == "invalid_grant") {
            this._jwtAuth.logout();
            return throwError(errorResponse.error);
        }
    }

    private handle401Error(errorResponse: HttpErrorResponse, request: HttpRequest<any>, next: HttpHandler) {
        console.debug(errorResponse.error);
        return this._jwtAuth.refreshToken()
            .pipe(
                switchMap(x => {
                    return next.handle(this.applyCredentials(request, x.token));
                })
            );
        // if (!this._isRefreshingToken) {
        //     this._isRefreshingToken = true;
        //     this._refreshTokenSubject.next(null);

        //     return this._jwtAuth.refreshToken()
        //         .pipe(
        //             switchMap(x => {
        //                 this._isRefreshingToken = false;
        //                 this._refreshTokenSubject.next(x);
        //                 return next.handle(this.applyCredentials(request, x.token));
        //             })
        //         );
        // } else {
        //     return this._refreshTokenSubject
        //         .pipe(
        //             filter(x => x != null),
        //             take(1),
        //             switchMap(x => {
        //                 return next.handle(this.applyCredentials(request, x.token));
        //             })
        //         );
        // }
    }
}

import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError } from 'rxjs';
import { tap, catchError, filter, take, finalize, switchMap } from 'rxjs/operators';
import { JwtTokenBase } from './models/jwt-token-base';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { RefreshTokenRequest } from './models/refresh-token-request';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import { JwtResponseError } from './models/jwt-response-error';
import { MutexFastLockService } from '@devlearning/mutex-fast-lock';
import { JwtAuthLogLevel } from './models/jwt-auth-log-level';


const JWT_AUTH_KEY_STORAGE: string = "jwt-auth";
const TOKEN_KEY_STORAGE: string = JWT_AUTH_KEY_STORAGE + "-token";
const REFRESHING_KEY_STORAGE: string = JWT_AUTH_KEY_STORAGE + "-refreshing";
const REFRESHING_EVENT_CHANGED: string = JWT_AUTH_KEY_STORAGE + "-refreshing-changed";

@Injectable({
  providedIn: 'root'
})
export class JwtAuthService<Token extends JwtTokenBase> {

  private _isLoggedInSubject: BehaviorSubject<boolean>;
  private _isRefreshingTokenSubject: BehaviorSubject<boolean>;
  private _jwtTokenSubject: BehaviorSubject<Token>;
  private _isLocalStorageSupported: boolean = false;
  private _refreshTokenSubject: BehaviorSubject<Token>;

  public get isLoggedIn$() {
    return this._isLoggedInSubject.asObservable();
  }

  public get jwtToken$() {
    return this._jwtTokenSubject.asObservable();
  }

  public get refreshingToken$() {
    return this._isRefreshingTokenSubject.asObservable();
  }

  public get isLoggedIn() { return this._isLoggedInSubject.value; }
  public get jwtToken() { return this._jwtTokenSubject.value; }

  constructor(
    @Inject(JWT_AUTH_CONFIG) private readonly _config: JwtAuthConfig,
    private readonly _http: HttpClient,
    private readonly _mutexFastLock: MutexFastLockService,
  ) {
    this._isLoggedInSubject = new BehaviorSubject<boolean>(false);
    this._isRefreshingTokenSubject = new BehaviorSubject<boolean>(false);
    this._jwtTokenSubject = new BehaviorSubject<Token>(null);
    this._refreshTokenSubject = new BehaviorSubject<Token>(null);
    this._isLocalStorageSupported = this._checkLocalStorageIsSupported();
    this._getLocalStorageSupported();
    this.setRefreshingToken(false);

    var that = this;
    window.addEventListener('storage', function (ev) {
      if (ev.key === TOKEN_KEY_STORAGE) {
        if (that._config.logLevel <= JwtAuthLogLevel.VERBOSE)
          console.debug("JwtAuth - eventListener storage token changed");
          
        let token = <Token>JSON.parse(ev.newValue);
        if (token?.accessToken != that.jwtToken.accessToken) {
          that._setToken(token);
          that._refreshTokenSubject.next(token);
        }
      }
    });
  }

  public setToken(jwtToken: Token) {
    this._setToken(jwtToken);
  }

  public token(request: any): Observable<Token> {
    // if (this._jwtTokenSubject.value != null
    //   && this._jwtTokenSubject.value.accessToken != null
    //   && !this.isTokenExpired()
    //   && !this.isRefreshTokenExpired()) {
    //   return of(this._jwtTokenSubject.value);
    // }

    return this._http.post<Token>(this._config.tokenUrl, request).pipe(
      tap(x => {
        this._setToken(x)
      }),
      catchError(err => {
        this._cleanToken();
        return this._handleError(err);
      })
    );
  }
  
  public refreshToken(): Observable<Token> {
    if (this._jwtTokenSubject.value == null || this._jwtTokenSubject.value.accessToken == null) {
      if (this._config.logLevel <= JwtAuthLogLevel.ERROR)
        console.error("JwtAuth - refreshToken this._jwtTokenSubject.value was null");
      return throwError(() => new Error("User is logged out"));
    }

    if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
      console.debug("JWT refreshToken");

    return this._mutexFastLock.lock(REFRESHING_KEY_STORAGE, 100)
      .pipe(
        switchMap(x => {
          if (!this.getIsRefreshingToken()) {
            this.setRefreshingToken(true);

            return this._mutexFastLock.lock(TOKEN_KEY_STORAGE)
              .pipe(
                tap(x => this._refreshTokenSubject.next(null)),
                tap(x => this._isRefreshingTokenSubject.next(true)),
                switchMap(x => {
                  let jwtToken = this._getJwtToken();
                  let request = new RefreshTokenRequest();
                  request.username = jwtToken.username;
                  request.refreshToken = jwtToken.refreshToken;
                  return this._http.post<Token>(this._config.refreshUrl, request)
                    .pipe(
                      tap(x => {
                        this._setToken(x)
                        this._refreshTokenSubject.next(x);
                      }),
                      catchError(err => {
                        if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
                          console.debug("JWT refreshToken err " + err);
                        if (err.message && err.message.indexOf("Lock could not be acquired") >= 0) {
                          return this._refreshTokenSubject
                            .pipe(
                              filter(x => x != null),
                              filter(x => !this._checkTokenIsExpired(x)),
                              take(1)
                            );
                        } else {
                          if (err.status == 468) {
                            return throwError(() => new Error("Refresh token expired"));
                          } else {
                            this._cleanToken();
                            return this._handleError(err);
                          }
                        }
                      }),
                      finalize(() => {
                        this.setRefreshingToken(false);
                        this._mutexFastLock.release(TOKEN_KEY_STORAGE);
                        this._mutexFastLock.release(REFRESHING_KEY_STORAGE);
                        this._isRefreshingTokenSubject.next(false);
                      })
                    );
                })
              )
          } else {
            return this._refreshTokenSubject
              .pipe(
                filter(x => x != null),
                filter(x => !this._checkTokenIsExpired(x)),
                take(1)
              );
          }
        }),
        catchError((err) => {
          this._mutexFastLock.release(REFRESHING_KEY_STORAGE);
          if (err.message && err.message.indexOf("Lock could not be acquired") >= 0) {
            return this._refreshTokenSubject
              .pipe(
                filter(x => x != null),
                filter(x => !this._checkTokenIsExpired(x)),
                take(1)
              )
          } else {
            return throwError(() => new Error(err));
          }
        })
      );
  }

  public logout() {
    this._cleanToken();
  }

  public isAuthenticationUrl(url: string): boolean {
    return url == this._config.tokenUrl || url == this._config.refreshUrl;
  }

  private getIsRefreshingToken() {
    return localStorage.getItem(REFRESHING_KEY_STORAGE) == 'true';
  }

  private setRefreshingToken(refreshing: boolean) {
    localStorage.setItem(REFRESHING_KEY_STORAGE, '' + refreshing);
  }

  private _setToken(jwtToken: Token) {
    if (jwtToken != null) {
      this._saveJwtToken(jwtToken);
      this._isLoggedInSubject.next(true);
      this._jwtTokenSubject.next(jwtToken);
    } else {
      this._cleanToken();
    }
  }

  private _cleanToken() {
    this._deleteJwtToken();
    this._isLoggedInSubject.next(false);
    this._jwtTokenSubject.next(null);
  }

  public async init() {
    // console.debug("JWT init");
    let jwtToken = this._getJwtToken();
    // console.debug("JWT init " + JSON.stringify(jwtToken));
    if (jwtToken != null && jwtToken.accessToken != null) {
      this._jwtTokenSubject.next(jwtToken);
      if (!this.isTokenExpired()) {
        // console.debug("JWT init !isTokenExpired");
        this._setToken(jwtToken);
      } else if (!this.isRefreshTokenExpired()) {
        // console.debug("JWT init isTokenExpired");
        try {
          // console.debug("JWT init refresh");
          await this.refreshToken().toPromise();
        } catch (error) {
          this.logout();
          return this._handleError(error).toPromise();
        }
      }
    } else {
      this.logout();
    }
  }

  private _checkLocalStorageIsSupported() {
    try {
      localStorage.setItem(JWT_AUTH_KEY_STORAGE + '-test-storage', "test");
      localStorage.removeItem(JWT_AUTH_KEY_STORAGE + '-test-storage');
      return true;
    } catch (e) {
      return false;
    }
  }

  private _getLocalStorageSupported() {
    if (!this._isLocalStorageSupported) {
      if (this._config.logLevel <= JwtAuthLogLevel.ERROR)
        console.error("LocalStorage is not supported");
    }
    return this._isLocalStorageSupported;
  }

  private _saveJwtToken(jwtToken: Token) {
    if (!this._isLocalStorageSupported) return;
    localStorage.setItem(TOKEN_KEY_STORAGE, JSON.stringify(jwtToken));
  }

  private _getJwtToken() {
    if (!this._isLocalStorageSupported) return undefined;
    return <Token>JSON.parse(localStorage.getItem(TOKEN_KEY_STORAGE));
  }

  private _deleteJwtToken() {
    localStorage.removeItem(TOKEN_KEY_STORAGE);
  }

  public isRefreshTokenExpired() {
    return new Date().getTime() > this._jwtTokenSubject.value.refreshTokenExpiresAt;
  }

  public isTokenExpired() {
    return this._checkTokenIsExpired(this._jwtTokenSubject.getValue());
  }

  public setTokenUrl(url: string) {
    this._config.tokenUrl = url;
  }

  public setRefreshUrl(url: string) {
    this._config.refreshUrl = url;
  }

  private _checkTokenIsExpired(token: Token) {
    return new Date().getTime() > token.expiresAt;
  }

  private _handleError(error) {
    let message: string;
    let detailedMessage: string;
    if (error.error instanceof Error) {
      if (this._config.logLevel <= JwtAuthLogLevel.ERROR)
        console.error('An error occurred:', error.error.message);
      message = error.error.message;
    } else if (error instanceof HttpErrorResponse) {
      if (error.status == 500) {
        message = error.error?.message;
        detailedMessage = error.error?.detailedMessage;
      } else {
        console.error(`Backend returned code ${error.status}, body was: ${error.message}`);
        message = error.message;
      }
    }
    let jwtResponse = new JwtResponseError(message, detailedMessage, error.status);
    return throwError(() => jwtResponse);
  }
}

import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { tap, catchError, filter, take, finalize, switchMap, exhaustMap } from 'rxjs/operators';
import { JwtTokenBase } from './models/jwt-token-base';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { RefreshTokenRequest } from './models/refresh-token-request';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import { JwtResponseError } from './models/jwt-response-error';
import { MutexFastLockService } from '@devlearning/mutex-fast-lock';
import { JwtAuthLogLevel } from './models/jwt-auth-log-level';
import { StorageType } from '../public-api';
import { ERROR_EXPIRED_REFRESH_TOKEN, WWWAuthenticateMessageFactory } from './models/www-authenticate-message';


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
  private _jwtTokenSubject: BehaviorSubject<Token | null>;
  private _isLocalStorageSupported: boolean = false;
  private _refreshTokenSubject: BehaviorSubject<Token | null>;
  private _storage: Storage;

  /** Emits whenever the login state changes. */
  public get isLoggedIn$() {
    return this._isLoggedInSubject.asObservable();
  }

  /** Emits whenever the current token changes (null when logged out). */
  public get jwtToken$() {
    return this._jwtTokenSubject.asObservable();
  }

  /** Emits `true` while a token refresh is in progress. */
  public get refreshingToken$() {
    return this._isRefreshingTokenSubject.asObservable();
  }

  /** Current login state (synchronous). */
  public get isLoggedIn() { return this._isLoggedInSubject.value; }
  /** Current token (synchronous). `null` when logged out. */
  public get jwtToken() { return this._jwtTokenSubject.value; }

  constructor(
    @Inject(JWT_AUTH_CONFIG) private readonly _config: JwtAuthConfig,
    private readonly _http: HttpClient,
    private readonly _mutexFastLock: MutexFastLockService,
  ) {
    this._isLoggedInSubject = new BehaviorSubject<boolean>(false);
    this._isRefreshingTokenSubject = new BehaviorSubject<boolean>(false);
    this._jwtTokenSubject = new BehaviorSubject<Token | null>(null);
    this._refreshTokenSubject = new BehaviorSubject<Token | null>(null);

    if (this._config.storageType == StorageType.SESSION_STORAGE) {
      this._storage = sessionStorage;
    } else {
      this._storage = localStorage;
    }

    this._isLocalStorageSupported = this._checkStorageIsSupported();
    this._getLocalStorageSupported();
    this.setRefreshingToken(false);

    var that = this;
    window.addEventListener('storage', function (ev) {
      if (ev.key === TOKEN_KEY_STORAGE) {
        if (that._config.logLevel <= JwtAuthLogLevel.VERBOSE)
          console.debug("JwtAuth - eventListener storage token changed");

        let token = <Token | null>JSON.parse(ev.newValue ?? 'null');
        if (token?.accessToken != that.jwtToken?.accessToken) {
          that._setToken(token as Token);
          that._refreshTokenSubject.next(token);
        }
      }
    });
  }

  /**
   * Restores the session from storage. If the access token is expired but the
   * refresh token is still valid, a refresh is attempted automatically.
   * Call this manually when `useManualInitialization` is `true`.
   */
  public init() {
    return of(this._getJwtToken())
      .pipe(
        exhaustMap(jwtToken => {
          if (jwtToken != null && jwtToken.accessToken != null) {
            this._jwtTokenSubject.next(jwtToken);
            if (!this.isTokenExpired()) {
              if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
                console.debug("JwtAuth - init - isTokenExpired: false");

              this._setToken(jwtToken);
              return of(jwtToken);
            } else if (!this.isRefreshTokenExpired()) {
              if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
                console.debug("JwtAuth - init - isRefreshTokenExpired: false");

              return this.refreshToken()
                .pipe(
                  catchError((err, obs) => {
                    this.logout();
                    return this._handleError(err);
                  })
                );
            } else {
              if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
                console.debug("JwtAuth - init - token and refresh token is expired");

              this.logout();
              return of(null);
            }
          } else {
            if (this._config.logLevel <= JwtAuthLogLevel.VERBOSE)
              console.debug("JwtAuth - init - token is null");

            this.logout();
            return of(null);
          }
        })
      );
  }

  /**
   * Authenticates the user by posting `request` to `tokenUrl`.
   * On success the token is persisted to storage and reactive state is updated.
   *
   * @param request The login request body. Use the generic parameter `TRequest`
   *                to get full type-safety for your specific API contract.
   */
  public token<TRequest = object>(request: TRequest): Observable<Token> {
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

  /**
   * Refreshes the access token using the stored refresh token.
   * Concurrent calls are serialized with a mutex so only one HTTP request is
   * made; other callers wait and receive the same result.
   *
   * The request body is built by `refreshTokenRequestFactory` (if configured)
   * or falls back to `{ username, refreshToken }`.
   */
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
                  let request: object;
                  if (this._config.refreshTokenRequestFactory) {
                    request = this._config.refreshTokenRequestFactory(jwtToken ?? new JwtTokenBase());
                  } else {
                    const defaultRequest = new RefreshTokenRequest();
                    defaultRequest.username = jwtToken?.username ?? '';
                    defaultRequest.refreshToken = jwtToken?.refreshToken ?? '';
                    request = defaultRequest;
                  }
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
                              filter(x => !this._checkTokenIsExpired(x as Token)),
                              take(1)
                            );
                        } else {
                          if (err.status == 468) {
                            return throwError(() => new Error("Refresh token expired"));
                          } else if (err.status == 401) {
                            const wwwAuthenticate = WWWAuthenticateMessageFactory.create(err.headers.get('WWW-Authenticate'));
                            if (wwwAuthenticate.error == ERROR_EXPIRED_REFRESH_TOKEN) {
                              this._cleanToken();
                              return throwError(() => new Error("Refresh token expired"));
                            }
                            return throwError(() => new Error("Unauthorized"));
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

  /** Clears the stored token and emits the logged-out state. */
  public logout() {
    this._cleanToken();
  }

  /** Returns `true` if `url` is one of the authentication endpoints (token or refresh). */
  public isAuthenticationUrl(url: string): boolean {
    return url == this._config.tokenUrl || url == this._config.refreshUrl;
  }

  /** Returns `true` if the refresh token has passed its expiry timestamp. */
  public isRefreshTokenExpired() {
    return new Date().getTime() > (this._jwtTokenSubject.value?.refreshTokenExpiresIn ?? 0);
  }

  /** Returns `true` if the access token has passed its expiry timestamp. */
  public isTokenExpired() {
    return this._checkTokenIsExpired(this._jwtTokenSubject.value as Token);
  }

  /** Overrides the token URL at runtime. */
  public setTokenUrl(url: string) {
    this._config.tokenUrl = url;
  }

  /** Overrides the refresh URL at runtime. */
  public setRefreshUrl(url: string) {
    this._config.refreshUrl = url;
  }

  private getIsRefreshingToken() {
    return this._storage.getItem(REFRESHING_KEY_STORAGE) == 'true';
  }

  private setRefreshingToken(refreshing: boolean) {
    this._storage.setItem(REFRESHING_KEY_STORAGE, '' + refreshing);
  }

  /** Manually sets a token, persisting it to storage and updating reactive state. */
  public setToken(jwtToken: Token) {
    this._setToken(jwtToken);
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

  private _checkStorageIsSupported() {
    try {
      this._storage.setItem(JWT_AUTH_KEY_STORAGE + '-test-storage', "test");
      this._storage.removeItem(JWT_AUTH_KEY_STORAGE + '-test-storage');
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
    this._storage.setItem(TOKEN_KEY_STORAGE, JSON.stringify(jwtToken));
  }

  private _getJwtToken() {
    if (!this._isLocalStorageSupported) return undefined;
    return <Token>JSON.parse(this._storage.getItem(TOKEN_KEY_STORAGE) ?? 'null');
  }

  private _deleteJwtToken() {
    this._storage.removeItem(TOKEN_KEY_STORAGE);
  }

  private _checkTokenIsExpired(token: Token) {
    return new Date().getTime() > (token.expiresIn ?? 0);
  }

  private _handleError(error: any) {
    let message: string | undefined;
    let detailedMessage: string | undefined;
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
    let jwtResponse = new JwtResponseError(message ?? '', detailedMessage ?? '', error.status);
    return throwError(() => jwtResponse);
  }
}

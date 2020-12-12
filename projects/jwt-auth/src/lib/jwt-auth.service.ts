import { Inject, Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders, } from '@angular/common/http';
import { Observable, BehaviorSubject, throwError, of } from 'rxjs';
import { tap, map, catchError, filter, take, finalize } from 'rxjs/operators';
import { TokenRequest } from './models/token-request';
import { JwtToken } from './models/jwt-token';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { RefreshTokenRequest } from './models/refresh-token-request';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import * as moment_ from "moment";
import { JwtResponseError } from './models/jwt-response-error';
import { TokenWithFacebookLoginRequest } from './models/token-with-facebook-login-request';

const moment = moment_;

//TODO: l'errore del refresh token è che viene fatto il refresh simultaneamente dall'auth guard e dall'interceptor, 
// -  percio uno va a buon fine e l'altro no, causando l'errore di invalid grant
//    occorre gestire la cosa in modo da creare un canale unico che si occupa di refreshare il token e gli utilizzatori
//    possono solamente richiedere l'operazione. Quando è finita viene restituito il corretto refresh.
//    gli eventi successivi, essendo valido il token riciclano quello generato prima.
//    rifattorizzare tutti quelli che chiamano direttamente refreshToken con una richiesta di darlo
//    internamente l'authservice capisce se è scaduto e lo rigenera
// -  sarebbe inoltre opportuno evitare di accedere al token dallo storage. Tutte le chiamate dovrebbero richiamare
//    AuthService con la richiesta dammi il token e internamente viene eseguito quanto detto prima

@Injectable({
  providedIn: 'root'
})
export class JwtAuthService {

  private _isLoggedInSubject: BehaviorSubject<boolean>;
  private _isRefreshingTokenSubject: BehaviorSubject<boolean>;
  private _jwtTokenSubject: BehaviorSubject<JwtToken>;
  private _keyAuthStorage: string = "jwt-auth";
  private _isLocalStorageSupported: boolean = false;
  private _isRefreshingToken: boolean;
  private _refreshTokenSubject: BehaviorSubject<JwtToken>;

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
    private http: HttpClient,
  ) {
    this._isLoggedInSubject = new BehaviorSubject<boolean>(false);
    this._isRefreshingTokenSubject = new BehaviorSubject<boolean>(false);
    this._jwtTokenSubject = new BehaviorSubject<JwtToken>(null);
    this._refreshTokenSubject = new BehaviorSubject<JwtToken>(null);
    this._isRefreshingToken = false;
    this._isLocalStorageSupported = this._checkLocalStorageIsSupported();
    this._getLocalStorageSupported();

    //this._init();
  }

  public token(request: TokenRequest): Observable<JwtToken> {
    if (this._jwtTokenSubject.value != null
      && this._jwtTokenSubject.value.token != null
      && !this.isTokenExpires()
      && !this.isRefreshTokenExpires()) {
      return of(this._jwtTokenSubject.value);
    }

    let headers = new HttpHeaders();
    // headers.set('Content-type', 'application/x-www-form-urlencoded; charset=utf-8');

    return this.http.post<JwtToken>(this._config.tokenUrl, request, {
      headers: headers
    }).pipe(
      tap(x => {
        this._setToken(x)
      }),
      map(x => x),
      catchError(err => {
        this._cleanToken();
        return this._handleError(err);
      })
    );
  }

  public tokenWithFacebookLogin(request: TokenWithFacebookLoginRequest) {
    this._cleanToken();

    let headers = new HttpHeaders();

    if (this._config.tokenWithFacebookUrl == null || this._config.tokenWithFacebookUrl == '') throw new Error("Configuration of tokenWithFacebookUrl is missing");

    return this.http.post<JwtToken>(this._config.tokenWithFacebookUrl, request, {
      headers: headers
    }).pipe(
      tap(x => {
        this._setToken(x)
      }),
      map(x => x),
      catchError(err => {
        this._cleanToken();
        return this._handleError(err);
      })
    );
  }

  public logout() {
    this._cleanToken();
  }

  public refreshToken(): Observable<JwtToken> {
    console.info("JwtAuth - refreshToken - enter");
    
    if (this._jwtTokenSubject.value == null || this._jwtTokenSubject.value.token == null) {
      console.error("JwtAuth - refreshToken this._jwtTokenSubject.value was null");
      return throwError("User is logged out");
    }

    
    if (!this._isRefreshingToken) {
      console.info("JwtAuth - refreshToken - this._isRefreshingToken false");

      this._isRefreshingToken = true;
      this._isRefreshingTokenSubject.next(this._isRefreshingToken);
      this._refreshTokenSubject.next(null);

      let request = new RefreshTokenRequest();
      request.username = this._jwtTokenSubject.value.username;
      request.refreshToken = this._jwtTokenSubject.value.refreshToken;

      return this.http.post<JwtToken>(this._config.refreshUrl, request)
        .pipe(
          tap(x => {
            this._setToken(x)
            this._isRefreshingToken = false;
            this._isRefreshingTokenSubject.next(this._isRefreshingToken);
            this._refreshTokenSubject.next(x);
          }),
          catchError(err => {
            this._isRefreshingToken = false;
            this._isRefreshingTokenSubject.next(this._isRefreshingToken);
            if (err.status == 401) {
              //check del messaggio refresh_token
              this._cleanToken();
            }
            return this._handleError(err);
          }),
          finalize(() => {
            this._isRefreshingToken = false;
            this._isRefreshingTokenSubject.next(this._isRefreshingToken);
          })
        );
    } else {
      return this._refreshTokenSubject
        .pipe(
          filter(x => x != null),
          take(1)
        );
    }
  }

  public isAuthenticationUrl(url: string): boolean {
    return url == this._config.tokenUrl || url == this._config.refreshUrl;
  }

  private _setToken(jwtToken: JwtToken) {
    this._saveJwtToken(jwtToken);
    this._isLoggedInSubject.next(true);
    this._jwtTokenSubject.next(jwtToken);
  }

  private _cleanToken() {
    this._deleteJwtToken();
    this._isLoggedInSubject.next(false);
    this._jwtTokenSubject.next(null);
  }

  // private _init() {
  //   let storedJwtToken = this._getJwtToken();
  //   if (Utils.isDefinedAndNotNull(storedJwtToken)) {
  //     this._setToken(storedJwtToken);
  //   } else {
  //     this._cleanToken();
  //   }
  // }

  public async init() {
    let jwtToken = this._getJwtToken();
    if (jwtToken != null && jwtToken.token != null) {
      this._jwtTokenSubject.next(jwtToken);
      if (!this.isTokenExpires()) {
        this._setToken(jwtToken);
      } else if (!this.isRefreshTokenExpires()) {
        try {
          await this.refreshToken().toPromise();
        } catch (error) {
          this.logout();
          return this._handleError(error);
        }
      }
    } else {
      this.logout();
    }
  }

  private _checkLocalStorageIsSupported() {
    try {
      localStorage.setItem(this._keyAuthStorage + '-test-storage', "test");
      localStorage.removeItem(this._keyAuthStorage + '-test-storage');
      return true;
    } catch (e) {
      return false;
    }
  }

  private _getLocalStorageSupported() {
    if (!this._isLocalStorageSupported) {
      console.error("LocalStorage is not supported");
    }
    return this._isLocalStorageSupported;
  }

  private _saveJwtToken(jwtToken: JwtToken) {
    if (!this._isLocalStorageSupported) return;

    localStorage.setItem(this._keyAuthStorage + '-token', JSON.stringify(jwtToken));
  }

  private _getJwtToken() {
    if (!this._isLocalStorageSupported) return undefined;

    return <JwtToken>JSON.parse(localStorage.getItem(this._keyAuthStorage + '-token'));
  }

  private _deleteJwtToken() {
    localStorage.removeItem(this._keyAuthStorage + '-token');
  }

  public isTokenExpires() {
    return moment().utc().isAfter(this._jwtTokenSubject.value.expires);
  }

  public isRefreshTokenExpires() {
    return moment().utc().isAfter(this._jwtTokenSubject.value.refreshTokenExpiration);
  }

  private _handleError(error) {
    let message: string;
    let detailedMessage: string;
    if (error.error instanceof Error) {
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
    return throwError(new JwtResponseError(message, detailedMessage));
  }
}

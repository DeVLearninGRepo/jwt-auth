# JwtAuth

JWT Angular Authentication manager with automatic Refresh Token management, multi-tab sync, and mutex-based concurrent refresh protection.

## Installation

```bash
npm i @devlearning/jwt-auth
```

---

## Configuration

Add `JwtAuthModule.forRoot(...)` to your `AppModule`:

```ts
import { JwtAuthModule } from '@devlearning/jwt-auth';

@NgModule({
  imports: [
    JwtAuthModule.forRoot({
      tokenUrl: environment.jwtAuthToken,
      refreshUrl: environment.jwtAuthRefreshToken,
    })
  ]
})
export class AppModule {}
```

### JwtAuthConfig options

| Property | Type | Required | Default | Description |
|---|---|---|---|---|
| `tokenUrl` | `string` | ✅ | — | URL to obtain the bearer token |
| `refreshUrl` | `string` | ✅ | — | URL to refresh the bearer token |
| `useManualInitialization` | `boolean` | — | `false` | If `true`, you must call `init()` manually |
| `logLevel` | `JwtAuthLogLevel` | — | — | Minimum log level (`VERBOSE`, `INFO`, `WARNING`, `ERROR`, `NONE`) |
| `storageType` | `StorageType` | — | `LOCAL_STORAGE` | Storage used for token persistence (`LOCAL_STORAGE` or `SESSION_STORAGE`) |
| `refreshTokenRequestFactory` | `(token: JwtTokenBase) => object` | — | — | Custom factory to build the refresh token request body. Use when your API requires extra fields beyond `username` and `refreshToken` |

Example with all options:

```ts
JwtAuthModule.forRoot({
  tokenUrl: '/api/auth/token',
  refreshUrl: '/api/auth/refresh',
  useManualInitialization: false,
  logLevel: JwtAuthLogLevel.ERROR,
  storageType: StorageType.SESSION_STORAGE,
})
```

---

## Token model

The server response for both `tokenUrl` and `refreshUrl` must be compatible with `JwtTokenBase`:

```ts
export class JwtTokenBase {
  username: string | undefined;
  accessToken: string | undefined;
  expiresIn: number | undefined;           // Unix timestamp (ms)
  refreshToken: string | undefined;
  refreshTokenExpiresIn: number | undefined; // Unix timestamp (ms)
}
```

You can extend it with your own fields:

```ts
export class MyToken extends JwtTokenBase {
  email: string;
  role: string;
}
```

Then pass it as the generic parameter to the service:

```ts
constructor(private readonly _jwtAuth: JwtAuthService<MyToken>) {}
```

---

## Usage

### Login

Call `token()` with your login request object. The method is generic so you can pass any typed request:

```ts
import { JwtAuthService } from '@devlearning/jwt-auth';

export interface LoginRequest {
  username: string;
  password: string;
}

@Injectable()
export class AuthService {
  constructor(private readonly _jwtAuth: JwtAuthService<MyToken>) {}

  login(username: string, password: string) {
    return this._jwtAuth.token<LoginRequest>({ username, password });
  }
}
```

### Logout

```ts
this._jwtAuth.logout();
```

### Reactive state

| Member | Type | Description |
|---|---|---|
| `isLoggedIn$` | `Observable<boolean>` | Emits whenever the login state changes |
| `jwtToken$` | `Observable<Token \| null>` | Emits whenever the token changes |
| `refreshingToken$` | `Observable<boolean>` | Emits `true` while a refresh is in progress |
| `isLoggedIn` | `boolean` | Current login state (synchronous) |
| `jwtToken` | `Token \| null` | Current token (synchronous) |

---

## Custom refresh token request

If your refresh endpoint requires extra fields (e.g. an application code), provide a `refreshTokenRequestFactory` in the config:

```ts
JwtAuthModule.forRoot({
  tokenUrl: '/api/auth/token',
  refreshUrl: '/api/auth/refresh',
  refreshTokenRequestFactory: (token) => ({
    authApplicationCode: 'MY_APP',
    username: token.username,
    refreshToken: token.refreshToken,
  }),
})
```

When `refreshTokenRequestFactory` is not provided, the default request body sent to `refreshUrl` is:

```json
{
  "username": "...",
  "refreshToken": "..."
}
```

---

## Guard

Extend `JwtAuthGuard` to protect your routes:

```ts
import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { JwtAuthGuard, JwtAuthService } from '@devlearning/jwt-auth';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable()
export class AuthGuard extends JwtAuthGuard implements CanActivate {

  constructor(
    private readonly _router: Router,
    private readonly _jwtAuth: JwtAuthService<any>
  ) {
    super(_jwtAuth);
  }

  canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    return this.canActivateBase(route, state)
      .pipe(
        map(x => {
          if (x) {
            return true;
          } else {
            this._router.navigateByUrl('/login');
            return false;
          }
        }),
        catchError(() => {
          this._router.navigateByUrl('/login');
          return of(false);
        })
      );
  }
}
```

---

## Manual initialization

If `useManualInitialization: true`, call `init()` at app startup (e.g. in `APP_INITIALIZER`). This will attempt to restore the session from storage, refreshing the token automatically if needed:

```ts
export function initializeAuth(jwtAuth: JwtAuthService<any>) {
  return () => jwtAuth.init().toPromise();
}

@NgModule({
  providers: [
    {
      provide: APP_INITIALIZER,
      useFactory: initializeAuth,
      deps: [JwtAuthService],
      multi: true,
    }
  ]
})
export class AppModule {}
```

---

## Multi-tab sync

When using `LOCAL_STORAGE`, token changes in other browser tabs are automatically detected and synced via the `storage` event. This ensures all tabs share the same authentication state.

`SESSION_STORAGE` is scoped to a single tab and does not sync across tabs.

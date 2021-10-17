# JwtAuth

Jwt Angular Authentication manager with automatic Refresh Token management.

## Installation 

```bash
npm i @devlearning/jwt-auth
```

## Configuration 

add to app.module this import:

```js
    JwtAuthModule.forRoot({
        tokenUrl: environment.jwtAuthToken,
        refreshUrl: environment.jwtAuthRefreshToken,
    })
```

jwtAuthToken is the url to otain bearer token. Server response must the same of this class:
Example

```js
export const environment = {
  ...
  jwtAuthToken: '/api/v1/jwtauth/token',
  jwtAuthRefreshToken: '/api/v1/jwtauth/refreshToken',
};
```



```js
export class JwtToken {
    username: string;
    email: string;
    token: string;                        
    expires: moment.Moment;               
    refreshToken: string;                 
    refreshTokenExpiration: moment.Moment;
}
```

jwtAuthRefreshToken is the url to refresh the bearer token. Server response must the same of previous class.


## Usage

to make a login call method "token" of service "JwtAuthService"

```js
    import { JwtAuthService } from '@devlearning/jwt-auth';
    
    ...

    constructor(
        ...
        private readonly _jwtAuth: JwtAuthService
    ) {

    }

    login() {
        ...
        this._jwtAuth.token({username: 'usernameOrEmail field value', password: 'password'})
            .pipe(
                ...
            ).subscribe(x=> {
                ...
            });
        ...
    }
```

In JwtAuthService is available two Observable for monitoring loggedin status:
    - isLoggedIn$
    - jwtToken$
or property with current value
    - isLoggedIn
    - jwtToken


to use the JwtAuthGuard in canActivate route parameter:
    - create auth.guard.ts
    - extends JwtAuthguard class 
    - call method canActivate of base class

```js
import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { JwtAuthGuard, JwtAuthService } from '@devlearning/jwt-auth';
import { Observable } from 'rxjs';


@Injectable()
export class AuthGuard extends JwtAuthGuard implements CanActivate {

    constructor(
        private readonly _router: Router,
        private readonly _jwtAuth: JwtAuthService
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
                        this._router.navigateByUrl('/login'); //your login url
                        return false;
                    }
                }),
                catchError(e => {
                    this._router.navigateByUrl('/login');  //your login url
                    return of(false);
                })
            );
    }
}
```
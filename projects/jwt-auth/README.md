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

```js
export class JwtToken {
    username: string;
    email: string;
    token: string;                          //MANDATORY
    expires: moment.Moment;                 //MANDATORY
    refreshToken: string;                   //MANDATORY
    refreshTokenExpiration: moment.Moment;  //MANDATORY
}
```

jwtAuthRefreshToken is the url to refresh the bearer token. Server response must the same of previous class.


## Usage

to make a login call method "token" of service "JwtAuthService"

```js
this._jwtAuth.token({username: 'username', password: 'password'})   //return an observable
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
        return this.canActivateBase();
    }
}
```
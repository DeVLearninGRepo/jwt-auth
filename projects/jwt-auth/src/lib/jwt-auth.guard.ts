import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { Observable, of } from 'rxjs';
import { JwtAuthService } from './jwt-auth.service';
import { catchError, mergeMap } from 'rxjs/operators';

export class JwtAuthGuard {

  constructor(
    private readonly _jwtAuthService: JwtAuthService
  ) { }

  canActivateBase(route: ActivatedRouteSnapshot, state: RouterStateSnapshot): Observable<boolean> {
    if (this._jwtAuthService.jwtToken == null
        || this._jwtAuthService.isLoggedIn == null
        || !this._jwtAuthService.isLoggedIn
        || this._jwtAuthService.isRefreshTokenExpired()) { 
      return of(false);
    } else if (this._jwtAuthService.isTokenExpired()) {
      return this._jwtAuthService.refreshToken()
        .pipe(
            mergeMap(x => of(true)),
            catchError(err => of(false))
        );
    } else {
      return of(true);
    }
  }
}
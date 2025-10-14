import { EnvironmentProviders, makeEnvironmentProviders, importProvidersFrom, provideAppInitializer, inject } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { MutexFastLockModule } from '@devlearning/mutex-fast-lock';
import { JwtAuthService } from './jwt-auth.service';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { JwtTokenBase } from './models/jwt-token-base';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import { jwtAuthInterceptorFn } from './jwt-auth.interceptor';

export function provideJwtAuth(config: JwtAuthConfig): EnvironmentProviders {
  return makeEnvironmentProviders([
    importProvidersFrom(MutexFastLockModule),

    { provide: JWT_AUTH_CONFIG, useValue: config },

    provideHttpClient(withInterceptors([jwtAuthInterceptorFn])),

    ...(!config.useManualInitialization
      ? [
        provideAppInitializer(() => {
          const svc = inject<JwtAuthService<JwtTokenBase>>(JwtAuthService);
          return svc.init();
        }),
      ]
      : []),
  ]);
}

import { APP_INITIALIZER, ModuleWithProviders, NgModule } from '@angular/core';
import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { MutexFastLockModule } from '@devlearning/mutex-fast-lock';
import { JwtAuthConfig } from './models/jwt-auth-config';
import { JwtAuthService } from './jwt-auth.service';
import { JwtTokenBase } from './models/jwt-token-base';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import { JwtAuthInterceptor } from './jwt-auth.interceptor';

@NgModule({
  imports: [MutexFastLockModule],
})
export class JwtAuthModule {
  static forRoot(config: JwtAuthConfig): ModuleWithProviders<JwtAuthModule> {
    const providers: any[] = [
      { provide: JWT_AUTH_CONFIG, useValue: config },
      { provide: HTTP_INTERCEPTORS, useClass: JwtAuthInterceptor, multi: true },
    ];

    if (!config.useManualInitialization) {
      providers.push({
        provide: APP_INITIALIZER,
        multi: true,
        useFactory: (svc: JwtAuthService<JwtTokenBase>) => () => firstValueFrom(svc.init()),
        deps: [JwtAuthService],
      });
    }

    return {
      ngModule: JwtAuthModule,
      providers,
    };
  }
}

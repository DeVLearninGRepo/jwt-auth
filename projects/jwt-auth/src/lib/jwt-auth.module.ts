import { HTTP_INTERCEPTORS } from '@angular/common/http';
import { APP_INITIALIZER, InjectionToken, ModuleWithProviders, NgModule } from '@angular/core';
import { JWT_AUTH_CONFIG } from './jwt-auth-config.injector';
import { JwtAuthInterceptor } from './jwt-auth.interceptor';
import { JwtAuthService } from './jwt-auth.service';
import { JwtAuthConfig } from './models/jwt-auth-config';

@NgModule()
export class JwtAuthModule {
	static forRoot(jwtAuthConfig: JwtAuthConfig): ModuleWithProviders<JwtAuthModule> {

		return ({
			ngModule: JwtAuthModule,
			providers: [
				{ provide: JWT_AUTH_CONFIG, useValue: jwtAuthConfig },
				{ provide: HTTP_INTERCEPTORS, useClass: JwtAuthInterceptor, multi: true },
				{ provide: APP_INITIALIZER, useFactory: init, deps: [JwtAuthService], multi: true }
			]
		});

	}
}

export function init(jwtAuth: JwtAuthService) {
	const x = async () => { await jwtAuth.init() };
	return x;
}

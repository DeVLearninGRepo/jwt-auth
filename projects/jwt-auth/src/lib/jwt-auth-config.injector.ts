import { InjectionToken } from '@angular/core';
import { JwtAuthConfig } from './models/jwt-auth-config';

export const JWT_AUTH_CONFIG = new InjectionToken<JwtAuthConfig>('JWT_AUTH_CONFIG');
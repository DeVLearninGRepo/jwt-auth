# JWT Auth for Angular

[![npm version](https://badge.fury.io/js/%40devlearning%2Fjwt-auth.svg)](https://badge.fury.io/js/%40devlearning%2Fjwt-auth)
[![MIT License](https://img.shields.io/badge/License-MIT-green.svg)](https://choosealicense.com/licenses/mit/)

A comprehensive Angular library for JWT authentication management with automatic refresh token handling, cross-tab synchronization, and robust error recovery.

## ✨ Features

- 🔐 **Complete JWT Authentication Flow** - Login, logout, and session management
- 🔄 **Automatic Token Refresh** - Seamless background token renewal
- 🛡️ **HTTP Interceptor** - Automatic Bearer token injection and 401 error handling
- 🚪 **Route Guards** - Protect your routes with authentication checks
- 🔄 **Cross-Tab Synchronization** - Share authentication state across browser tabs
- 💾 **Flexible Storage** - Support for localStorage and sessionStorage
- 🔒 **Thread-Safe Operations** - Mutex locks prevent concurrent refresh calls
- 📝 **TypeScript Support** - Fully typed with generic token support
- 🎯 **Angular Standalone** - Compatible with modern Angular standalone APIs
- 🐛 **Comprehensive Logging** - Configurable debug levels for troubleshooting

## 📋 Requirements

- Angular 15+
- RxJS 7+
- TypeScript 4.9+

## 🚀 Installation

```bash
npm install @devlearning/jwt-auth
```

## ⚙️ Configuration

### Basic Setup (Standalone Application)

Configure the library in your `main.ts` file:

```typescript
import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { provideJwtAuth } from '@devlearning/jwt-auth';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { JwtAuthLogLevel, StorageType } from '@devlearning/jwt-auth';

bootstrapApplication(AppComponent, {
  providers: [
    provideRouter(routes),
    provideJwtAuth({
      tokenUrl: '/api/v1/auth/login',           // Login endpoint
      refreshUrl: '/api/v1/auth/refresh',      // Refresh token endpoint
      useManualInitialization: false,         // Auto-initialize on startup
      logLevel: JwtAuthLogLevel.ERROR,         // Logging level
      storageType: StorageType.LOCAL_STORAGE   // Storage preference
    }),
  ],
});
```

### Configuration Options

```typescript
export interface JwtAuthConfig {
  tokenUrl: string;                    // URL for obtaining access tokens
  refreshUrl: string;                  // URL for refreshing tokens
  useManualInitialization?: boolean;   // Default: false
  logLevel?: JwtAuthLogLevel;          // Default: ERROR
  storageType?: StorageType;           // Default: LOCAL_STORAGE
}
```

### Server Response Format

Your authentication endpoints should return tokens in this format:

```typescript
export interface JwtTokenBase {
  username?: string;
  accessToken?: string;              // The JWT access token
  expiresIn?: number;               // Access token expiration (seconds)
  refreshToken?: string;            // Refresh token
  refreshTokenExpiresIn?: number;   // Refresh token expiration (seconds)
}
```

**Example server response:**
```json
{
  "username": "john.doe@example.com",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": 3600,
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshTokenExpiresIn": 86400
}
```

## 🎯 Usage

### Authentication Service

#### Login

```typescript
import { Component } from '@angular/core';
import { JwtAuthService, TokenRequest } from '@devlearning/jwt-auth';
import { Router } from '@angular/router';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html'
})
export class LoginComponent {
  
  constructor(
    private jwtAuth: JwtAuthService,
    private router: Router
  ) {}

  async login(username: string, password: string) {
    const loginRequest: TokenRequest = { username, password };
    
    this.jwtAuth.token(loginRequest).subscribe({
      next: (token) => {
        console.log('Login successful', token);
        this.router.navigate(['/dashboard']);
      },
      error: (error) => {
        console.error('Login failed', error);
      }
    });
  }
}
```

#### Monitor Authentication State

```typescript
import { Component, OnInit } from '@angular/core';
import { JwtAuthService } from '@devlearning/jwt-auth';

@Component({
  selector: 'app-header',
  template: `
    <div *ngIf="jwtAuth.isLoggedIn$ | async">
      Welcome, {{ (jwtAuth.jwtToken$ | async)?.username }}!
      <button (click)="logout()">Logout</button>
    </div>
  `
})
export class HeaderComponent implements OnInit {
  
  constructor(public jwtAuth: JwtAuthService) {}

  ngOnInit() {
    // Subscribe to authentication state changes
    this.jwtAuth.isLoggedIn$.subscribe(isLoggedIn => {
      console.log('Authentication state changed:', isLoggedIn);
    });
  }

  logout() {
    this.jwtAuth.logout();
  }
}
```

### Route Protection

Create a custom guard extending the base `JwtAuthGuard`:

```typescript
import { Injectable } from '@angular/core';
import { Router, CanActivate, ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { JwtAuthGuard, JwtAuthService } from '@devlearning/jwt-auth';
import { Observable } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class AuthGuard extends JwtAuthGuard implements CanActivate {

  constructor(
    private router: Router,
    private jwtAuth: JwtAuthService
  ) { 
    super(jwtAuth);
  }

  canActivate(
    route: ActivatedRouteSnapshot, 
    state: RouterStateSnapshot
  ): Observable<boolean> {
    
    return this.canActivateBase(route, state).pipe(
      map(isAuthenticated => {
        if (isAuthenticated) {
          return true;
        } else {
          // Redirect to login with return URL
          this.router.navigate(['/login'], { 
            queryParams: { returnUrl: state.url } 
          });
          return false;
        }
      }),
      catchError(error => {
        console.error('Authentication guard error:', error);
        this.router.navigate(['/login']);
        return of(false);
      })
    );
  }
}
```

#### Apply to Routes

```typescript
import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { 
    path: 'dashboard', 
    component: DashboardComponent, 
    canActivate: [AuthGuard] 
  },
  { 
    path: 'admin', 
    loadChildren: () => import('./admin/admin.module').then(m => m.AdminModule),
    canActivate: [AuthGuard]
  }
];
```

### HTTP Interceptor

The library automatically configures an HTTP interceptor that:

- ✅ Adds `Authorization: Bearer <token>` headers to requests
- ✅ Automatically refreshes expired tokens
- ✅ Retries failed requests with new tokens
- ✅ Excludes authentication URLs from interception

The interceptor is automatically registered when using `provideJwtAuth()`.

## 🔧 Advanced Usage

### Manual Initialization

If you need to control when the authentication service initializes:

```typescript
// Configure with manual initialization
provideJwtAuth({
  tokenUrl: '/api/auth/login',
  refreshUrl: '/api/auth/refresh',
  useManualInitialization: true,  // Don't auto-initialize
  logLevel: JwtAuthLogLevel.VERBOSE
})

// Manually initialize when ready
@Component({...})
export class AppComponent implements OnInit {
  constructor(private jwtAuth: JwtAuthService) {}
  
  ngOnInit() {
    // Initialize authentication when app is ready
    this.jwtAuth.init().subscribe({
      next: (token) => console.log('Auth initialized', token),
      error: (error) => console.error('Auth init failed', error)
    });
  }
}
```

### Custom Token Types

Extend the base token interface for additional properties:

```typescript
interface CustomJwtToken extends JwtTokenBase {
  roles: string[];
  permissions: string[];
  organizationId: string;
}

// Use with typed service
constructor(private jwtAuth: JwtAuthService<CustomJwtToken>) {}

// Access custom properties
this.jwtAuth.jwtToken$.subscribe(token => {
  if (token) {
    console.log('User roles:', token.roles);
    console.log('Organization:', token.organizationId);
  }
});
```

### Storage Configuration

Choose between localStorage and sessionStorage:

```typescript
import { StorageType } from '@devlearning/jwt-auth';

provideJwtAuth({
  // ... other config
  storageType: StorageType.SESSION_STORAGE  // Clears on tab close
  // or
  storageType: StorageType.LOCAL_STORAGE    // Persists across sessions (default)
})
```

### Logging Configuration

Control debug output levels:

```typescript
import { JwtAuthLogLevel } from '@devlearning/jwt-auth';

provideJwtAuth({
  // ... other config
  logLevel: JwtAuthLogLevel.VERBOSE    // Maximum logging
  // or
  logLevel: JwtAuthLogLevel.ERROR      // Errors only (default)
})
```

## 🔄 Cross-Tab Synchronization

The library automatically synchronizes authentication state across browser tabs:

- ✅ Login in one tab → All tabs receive the authentication state
- ✅ Logout in one tab → All tabs are logged out
- ✅ Token refresh in one tab → All tabs get the new token
- ✅ Works with both localStorage and sessionStorage

## 🛠️ API Reference

### JwtAuthService Methods

| Method | Description | Returns |
|--------|-------------|---------|
| `token(request: TokenRequest)` | Authenticate with credentials | `Observable<Token>` |
| `refreshToken()` | Manually refresh the access token | `Observable<Token>` |
| `logout()` | Clear authentication state | `void` |
| `init()` | Initialize authentication (manual mode) | `Observable<Token \| null>` |
| `isTokenExpired()` | Check if access token is expired | `boolean` |
| `isRefreshTokenExpired()` | Check if refresh token is expired | `boolean` |

### JwtAuthService Properties

| Property | Type | Description |
|----------|------|-------------|
| `isLoggedIn$` | `Observable<boolean>` | Authentication state stream |
| `jwtToken$` | `Observable<Token>` | Current token stream |
| `refreshingToken$` | `Observable<boolean>` | Token refresh state |
| `isLoggedIn` | `boolean` | Current authentication state |
| `jwtToken` | `Token` | Current token value |

## 🐛 Troubleshooting

### Common Issues

**1. Interceptor not working**
```typescript
// Ensure you're using provideJwtAuth() which registers the interceptor
// Don't manually provide HTTP_INTERCEPTORS when using this library
```

**2. CORS issues**
```typescript
// Ensure your server allows Authorization headers
// Add to your server CORS config:
// Access-Control-Allow-Headers: Authorization, Content-Type
```

**3. Token refresh loops**
```typescript
// Ensure your refresh endpoint doesn't require authentication
// The refresh URL should accept the refresh token and return a new access token
```

**4. Storage not working**
```typescript
// Check browser storage availability
// Some browsers disable storage in private/incognito mode
```

### Debug Logging

Enable verbose logging to troubleshoot issues:

```typescript
provideJwtAuth({
  // ... other config
  logLevel: JwtAuthLogLevel.VERBOSE
})
```

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📞 Support

- 🐛 **Issues**: [GitHub Issues](https://github.com/DeVLearninGRepo/jwt-auth/issues)
- 📧 **Contact**: [Luca Evaroni](mailto:info@luca.evaroni.it)
- 📖 **Documentation**: [GitHub Repository](https://github.com/DeVLearninGRepo/jwt-auth)

## 🏷️ Keywords

Angular, JWT, Authentication, Authorization, Token, Refresh Token, Bearer, OAuth, Security, TypeScript
export class JwtToken {
    username: string;
    email: string;
    token: string;
    expires: number;
    refreshToken: string;
    refreshTokenExpiration: number;
}

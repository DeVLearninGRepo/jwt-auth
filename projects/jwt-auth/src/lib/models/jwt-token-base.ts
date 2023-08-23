export class JwtTokenBase {
    username: string | undefined;
    accessToken: string | undefined;
    expiresIn: number | undefined;
    refreshToken: string | undefined;
    refreshTokenExpiresIn: number | undefined;
}
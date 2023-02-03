export class JwtTokenBase {
    username: string;
    accessToken: string;
    expiresAt: number;
    refreshToken: string;
    refreshTokenExpiresAt: number;
}

// public int IdUser { get; set; }
// public string Username { get; set; }
// public string AccessToken { get; }
// public double ExpiresIn { get; set; }
// public string RefreshToken { get; }
// public double RefreshTokenExpiresIn { get; set; }
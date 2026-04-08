import { JwtAuthLogLevel } from "./jwt-auth-log-level";
import { JwtTokenBase } from "./jwt-token-base";
import { StorageType } from "./storage-type";

export class JwtAuthConfig {
  tokenUrl: string;
  refreshUrl: string;
  useManualInitialization: boolean;
  logLevel: JwtAuthLogLevel;
  storageType?: StorageType;
  refreshTokenRequestFactory?: (token: JwtTokenBase) => object;
}
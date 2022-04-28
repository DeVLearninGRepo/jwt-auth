import { JwtAuthLogLevel } from "./jwt-auth-log-level";

export class JwtAuthConfig {
  tokenUrl: string;
  refreshUrl: string;
  useManualInitialization: boolean;
  logLevel: JwtAuthLogLevel;
}
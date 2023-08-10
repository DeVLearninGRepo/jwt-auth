import { JwtAuthLogLevel } from "./jwt-auth-log-level";
import { StorageType } from "./storage-type";

export class JwtAuthConfig {
  tokenUrl: string;
  refreshUrl: string;
  useManualInitialization: boolean;
  logLevel: JwtAuthLogLevel;
  storageType?: StorageType;
}
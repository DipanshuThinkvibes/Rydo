/** Private file storage (license and RC photos). Files are only reachable through short-lived signed URLs. */
export interface StorageAdapter {
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  signedUploadUrl(key: string, contentType: string, expiresSec?: number): Promise<string>;
  signedReadUrl(key: string, expiresSec?: number): Promise<string>;
}
export const STORAGE_ADAPTER = Symbol('STORAGE_ADAPTER');
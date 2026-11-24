import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CreateBucketCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { StorageAdapter } from './storage.adapter';

/** Any S3-compatible store: RustFS locally; AWS S3, Cloudflare R2 and others in production. */
@Injectable()
export class S3StorageAdapter implements StorageAdapter, OnModuleInit {
  private readonly log = new Logger('Storage');
  private readonly s3: S3Client;
  /** Signs the links handed to apps. Same client unless S3_PUBLIC_ENDPOINT is set (the signature covers the host). */
  private readonly signer: S3Client;
  private readonly bucket: string;

  constructor() {
    const e = env();
    this.bucket = e.S3_BUCKET;
    const client = (endpoint?: string) =>
      new S3Client({
        region: e.S3_REGION,
        endpoint,
        forcePathStyle: !!endpoint,
        credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
      });
    this.s3 = client(e.S3_ENDPOINT);
    this.signer = e.S3_PUBLIC_ENDPOINT ? client(e.S3_PUBLIC_ENDPOINT) : this.s3;
  }

  /** Creates the private bucket when it is missing. */
  private async ensureBucket() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
      this.log.log(`Created bucket ${this.bucket}`);
    }
  }

  /** Creates the private bucket on first start. Never blocks startup: uploads fail later with a clear error instead. */
  async onModuleInit() {
    try {
      await this.ensureBucket();
    } catch (e) {
      this.log.warn(`Storage not reachable (${(e as Error).message}). File uploads will fail until it is.`);
    }
  }

  /**
   * Saves a file. If the bucket is missing (the store was down when the API started, or its data was wiped),
   * it is created and the upload is tried once more, so uploads work again without restarting the API.
   */
  async put(key: string, body: Buffer, contentType: string) {
    const send = () => this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
    try {
      await send();
    } catch (e) {
      if ((e as { name?: string }).name !== 'NoSuchBucket') throw e;
      await this.ensureBucket();
      await send();
    }
  }

  signedUploadUrl(key: string, contentType: string, expiresSec = 300) {
    return getSignedUrl(this.signer, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: expiresSec });
  }

  signedReadUrl(key: string, expiresSec = 120) {
    return getSignedUrl(this.signer, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresSec });
  }
}
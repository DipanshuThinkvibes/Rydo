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
  private readonly bucket: string;

  constructor() {
    const e = env();
    this.bucket = e.S3_BUCKET;
    this.s3 = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT,
      forcePathStyle: !!e.S3_ENDPOINT,
      credentials: { accessKeyId: e.S3_ACCESS_KEY, secretAccessKey: e.S3_SECRET_KEY },
    });
  }

  /** Creates the private bucket on first start. Never blocks startup: uploads fail later with a clear error instead. */
  async onModuleInit() {
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }));
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.log.log(`Created bucket ${this.bucket}`);
      } catch (e) {
        this.log.warn(`Storage not reachable (${(e as Error).message}). File uploads will fail until it is.`);
      }
    }
  }

  async put(key: string, body: Buffer, contentType: string) {
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }));
  }

  signedUploadUrl(key: string, contentType: string, expiresSec = 300) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: expiresSec });
  }

  signedReadUrl(key: string, expiresSec = 120) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresSec });
  }
}
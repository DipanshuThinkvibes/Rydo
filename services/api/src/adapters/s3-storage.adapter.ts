import { Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env';
import { StorageAdapter } from './storage.adapter';

/** Any S3-compatible store: RustFS locally; AWS S3, Cloudflare R2 and others in production. */
@Injectable()
export class S3StorageAdapter implements StorageAdapter {
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

  signedUploadUrl(key: string, contentType: string, expiresSec = 300) {
    return getSignedUrl(this.s3, new PutObjectCommand({ Bucket: this.bucket, Key: key, ContentType: contentType }), { expiresIn: expiresSec });
  }

  signedReadUrl(key: string, expiresSec = 120) {
    return getSignedUrl(this.s3, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: expiresSec });
  }
}
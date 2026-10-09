'use strict';
// Cloudflare R2 through its S3-compatible API. Browsers upload and download with presigned URLs,
// so file bytes never pass through this server.
const fs = require('node:fs');
const {
  S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand, DeleteObjectCommand,
  CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { newKey, contentDisposition } = require('./index');

const STABLE_WINDOW = 6 * 3600;

function createR2Storage(config) {
  const { endpoint, accessKeyId, secretAccessKey, bucket, region } = config.r2;
  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: true,
    credentials: { accessKeyId, secretAccessKey },
    // Newer SDKs add CRC32 checksum params to presigned URLs by default, which browsers can't satisfy.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
  });
  const Bucket = bucket;
  const notFound = (err) => err && (err.name === 'NotFound' || err.name === 'NoSuchKey' || (err.$metadata && err.$metadata.httpStatusCode === 404));
  const signed = new Set(['content-type', 'content-length']);

  return {
    kind: 'r2',
    origin: new URL(endpoint).origin,
    client,
    newKey,

    async presignPut(key, { contentType, contentLength, ttl = 3600 }) {
      const url = await getSignedUrl(client, new PutObjectCommand({ Bucket, Key: key, ContentType: contentType, ContentLength: contentLength }), {
        expiresIn: ttl, signableHeaders: signed, unhoistableHeaders: signed,
      });
      return { url, headers: { 'Content-Type': contentType } };
    },
    async createMultipart(key, contentType) {
      const out = await client.send(new CreateMultipartUploadCommand({ Bucket, Key: key, ContentType: contentType }));
      return out.UploadId;
    },
    async presignPart(key, uploadId, partNumber, contentLength, ttl = 6 * 3600) {
      return getSignedUrl(client, new UploadPartCommand({ Bucket, Key: key, UploadId: uploadId, PartNumber: partNumber, ContentLength: contentLength }), {
        expiresIn: ttl, signableHeaders: signed, unhoistableHeaders: signed,
      });
    },
    async completeMultipart(key, uploadId, parts) {
      const Parts = [...parts].sort((a, b) => a.number - b.number).map((p) => ({ PartNumber: p.number, ETag: p.etag }));
      await client.send(new CompleteMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId, MultipartUpload: { Parts } }));
    },
    async abortMultipart(key, uploadId) {
      await client.send(new AbortMultipartUploadCommand({ Bucket, Key: key, UploadId: uploadId })).catch(() => {});
    },

    async stat(key) {
      try {
        const out = await client.send(new HeadObjectCommand({ Bucket, Key: key }));
        return { size: Number(out.ContentLength) };
      } catch (err) {
        if (notFound(err)) return null;
        throw err;
      }
    },
    async readRange(key, start, end) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key, Range: `bytes=${start}-${end}` }));
      return Buffer.from(await out.Body.transformToByteArray());
    },
    async readStream(key) {
      const out = await client.send(new GetObjectCommand({ Bucket, Key: key }));
      return out.Body;
    },
    async putFile(localPath, key, contentType) {
      const { size } = await fs.promises.stat(localPath);
      await client.send(new PutObjectCommand({ Bucket, Key: key, Body: fs.createReadStream(localPath), ContentLength: size, ContentType: contentType }));
      await fs.promises.unlink(localPath).catch(() => {});
    },
    async remove(key) {
      if (!key) return;
      await client.send(new DeleteObjectCommand({ Bucket, Key: key })).catch((err) => { if (!notFound(err)) throw err; });
    },
    async urlFor(key, { contentType, filename, attachment = false, ttl = 3600, stable = false } = {}) {
      const cmd = new GetObjectCommand({
        Bucket, Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: contentDisposition(attachment ? 'attachment' : 'inline', filename),
        ResponseCacheControl: stable ? `private, max-age=${STABLE_WINDOW}` : undefined,
      });
      if (!stable) return getSignedUrl(client, cmd, { expiresIn: ttl });
      // Same URL for a whole window so browsers and the frontend can cache it.
      const windowStart = Math.floor(Date.now() / 1000 / STABLE_WINDOW) * STABLE_WINDOW;
      return getSignedUrl(client, cmd, { expiresIn: 4 * STABLE_WINDOW, signingDate: new Date(windowStart * 1000) });
    },
    async ffmpegInput(key) {
      return this.urlFor(key, { ttl: 4 * 3600 });
    },
  };
}

module.exports = { createR2Storage };

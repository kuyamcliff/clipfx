'use strict';
// Sets the CORS rules on your R2 bucket so browsers can upload to it directly.
// Usage: R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... R2_BUCKET=... \
//        CORS_ORIGINS=https://clipfx.vercel.app,https://clipfx.org npm run r2:cors
const { S3Client, PutBucketCorsCommand, GetBucketCorsCommand } = require('@aws-sdk/client-s3');
const { loadConfig } = require('../src/config');

async function main() {
  const config = loadConfig({ storage: 'r2' });
  const origins = (process.env.CORS_ORIGINS || config.baseUrl || '').split(',').map((s) => s.trim().replace(/\/+$/, '')).filter(Boolean);
  if (!origins.length) throw new Error('Set CORS_ORIGINS (or BASE_URL) to your frontend address, e.g. https://clipfx.vercel.app');
  const client = new S3Client({
    region: config.r2.region, endpoint: config.r2.endpoint, forcePathStyle: true,
    credentials: { accessKeyId: config.r2.accessKeyId, secretAccessKey: config.r2.secretAccessKey },
  });
  await client.send(new PutBucketCorsCommand({
    Bucket: config.r2.bucket,
    CORSConfiguration: {
      CORSRules: [{
        AllowedOrigins: origins,
        AllowedMethods: ['GET', 'HEAD', 'PUT'],
        AllowedHeaders: ['content-type'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3600,
      }],
    },
  }));
  const out = await client.send(new GetBucketCorsCommand({ Bucket: config.r2.bucket }));
  console.log(`CORS set on "${config.r2.bucket}":`);
  console.log(JSON.stringify(out.CORSRules, null, 2));
}

main().catch((err) => { console.error(err.message); process.exit(1); });

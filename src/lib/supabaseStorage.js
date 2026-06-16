const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_S3_ACCESS_KEY = process.env.SUPABASE_S3_ACCESS_KEY;
const SUPABASE_S3_SECRET_KEY = process.env.SUPABASE_S3_SECRET_KEY;
const SUPABASE_EXPENSES_BUCKET = process.env.SUPABASE_EXPENSES_BUCKET;

// Initialize S3 client for Supabase
const s3Client = new S3Client({
  forcePathStyle: true,
  region: 'ap-northeast-1', // Set to ap-northeast-1 as requested
  endpoint: `${SUPABASE_URL}/storage/v1/s3`,
  credentials: {
    accessKeyId: SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: SUPABASE_S3_SECRET_KEY,
  }
});

/**
 * Uploads a base64 file to Supabase storage using S3 API.
 */
const uploadExpenseProof = async ({ tenantId, userId, base64File, fileName, mimeType }) => {
  if (!SUPABASE_S3_ACCESS_KEY || !SUPABASE_S3_SECRET_KEY || !SUPABASE_EXPENSES_BUCKET) {
    throw new Error('Supabase configuration is missing or invalid in environment variables.');
  }

  // Remove the data URI prefix if it exists (e.g. data:image/png;base64,)
  const base64Data = base64File.replace(/^data:([A-Za-z-+/]+);base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');

  // Generate a unique file path: tenantId/userId/timestamp-random.extension
  const ext = fileName ? path.extname(fileName) : '';
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const filePath = `${tenantId}/${userId}/${uniqueName}`;

  try {
    await s3Client.send(new PutObjectCommand({
      Bucket: SUPABASE_EXPENSES_BUCKET,
      Key: filePath,
      Body: buffer,
      ContentType: mimeType || 'application/octet-stream',
    }));
  } catch (error) {
    console.error('Supabase S3 upload error:', error.message || error);
    throw new Error('Failed to upload expense proof to storage via S3 API.');
  }

  // Construct the public URL for the uploaded file
  const proofUrl = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_EXPENSES_BUCKET}/${filePath}`;

  return {
    proofPath: filePath,
    proofUrl: proofUrl
  };
};

/**
 * Deletes a file from Supabase storage using S3 API.
 */
const deleteExpenseProof = async (filePath) => {
  if (!SUPABASE_S3_ACCESS_KEY || !SUPABASE_S3_SECRET_KEY || !SUPABASE_EXPENSES_BUCKET || !filePath) {
    return;
  }

  try {
    await s3Client.send(new DeleteObjectCommand({
      Bucket: SUPABASE_EXPENSES_BUCKET,
      Key: filePath,
    }));
  } catch (error) {
    console.error(`Failed to delete expense proof at ${filePath}:`, error.message || error);
  }
};

module.exports = {
  uploadExpenseProof,
  deleteExpenseProof,
};

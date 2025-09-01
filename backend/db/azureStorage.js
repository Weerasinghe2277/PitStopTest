import dotenv from "dotenv";
import { BlobServiceClient } from '@azure/storage-blob';

dotenv.config();

const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
const containerName = process.env.AZURE_CONTAINER_NAME || 'documents';

if (!connectionString) {
  throw new Error('Azure Storage connection string is required');
}

const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);

export { blobServiceClient, containerName };
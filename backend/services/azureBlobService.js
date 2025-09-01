import { blobServiceClient, containerName } from '../db/azureStorage.js';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';

class AzureBlobService {
  
  async uploadFile(file, folderPath = '') {
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      
      // Ensure container exists
      await containerClient.createIfNotExists();
      
      // Generate unique filename
      const fileExtension = path.extname(file.originalname);
      const fileName = `${uuidv4()}${fileExtension}`;
      const blobName = folderPath ? `${folderPath}/${fileName}` : fileName;
      
      // Get blob client
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      // Upload file
      const uploadResponse = await blockBlobClient.upload(file.buffer, file.size, {
        blobHTTPHeaders: {
          blobContentType: file.mimetype,
        },
        metadata: {
          originalName: file.originalname,
          uploadedAt: new Date().toISOString(),
        }
      });

      return {
        success: true,
        blobName,
        fileName,
        url: blockBlobClient.url,
        uploadResponse
      };
    } catch (error) {
      throw new Error(`Azure upload failed: ${error.message}`);
    }
  }

  async deleteFile(blobName) {
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      await blockBlobClient.delete();
      return { success: true };
    } catch (error) {
      throw new Error(`Azure delete failed: ${error.message}`);
    }
  }

  async getFileUrl(blobName) {
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      return blockBlobClient.url;
    } catch (error) {
      throw new Error(`Failed to get file URL: ${error.message}`);
    }
  }

  async downloadFile(blobName) {
    try {
      const containerClient = blobServiceClient.getContainerClient(containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);
      
      const downloadResponse = await blockBlobClient.download();
      return downloadResponse;
    } catch (error) {
      throw new Error(`Azure download failed: ${error.message}`);
    }
  }
}

export default new AzureBlobService();
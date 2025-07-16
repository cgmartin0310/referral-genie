import axios from 'axios';
import FormData from 'form-data';
import { createReadStream } from 'fs';
import { createWriteStream } from 'fs';
import { writeFile } from 'fs/promises';
import { pipeline } from 'stream/promises';
import { tmpdir } from 'os';
import { join } from 'path';

// HumbleFax API types
interface HumbleFaxResponse {
  success: boolean;
  faxId?: string;
  tmpFaxId?: string;
  error?: string;
  status?: string;
  data?: any;
  details?: any;
}

interface HumbleFaxSendParams {
  to: string;
  documentUrl: string;
  callbackUrl?: string;
  metadata?: Record<string, any>;
  coverSheet?: {
    includeCoversheet: boolean;
    fromName?: string;
    fromNumber?: string;
    companyInfo?: string;
    toName?: string;
    subject?: string;
    message?: string;
  };
}

interface CreateTmpFaxParams {
  toName?: string;
  fromName?: string;
  subject?: string;
  message?: string;
  companyInfo?: string;
  fromNumber?: string | number;
  recipients: string[] | number[];
  resolution?: string;
  pageSize?: string;
  scheduledTime?: number;
  includeCoversheet?: boolean;
  uuid?: string;
}

export class HumbleFaxClient {
  // Change from private to public for logging purposes
  public apiUrl: string;
  private apiKey: string;
  private apiSecret: string;

  constructor(apiKey?: string, apiSecret?: string, apiUrl?: string) {
    this.apiKey = apiKey || process.env.HUMBLE_FAX_API_KEY || '';
    this.apiSecret = apiSecret || process.env.HUMBLE_FAX_API_SECRET || '';
    this.apiUrl = apiUrl || process.env.HUMBLE_FAX_API_URL || 'https://api.humblefax.com';
    
    // Log the API URL for debugging
    console.log('HumbleFaxClient initialized with URL:', this.apiUrl);
  }

  /**
   * Format a phone number for the API by:
   * 1. Removing all non-digit characters
   * 2. Ensuring it has country code 1 for US numbers
   * @param phoneNumber The phone number to format
   * @returns Formatted phone number
   */
  private formatPhoneNumber(phoneNumber?: string): string | undefined {
    if (!phoneNumber) return undefined;
    
    // Remove all non-digit characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Add country code 1 if not present and length is 10 digits
    if (cleaned.length === 10) {
      cleaned = '1' + cleaned;
    }
    
    return cleaned;
  }

  /**
   * Send a fax to a recipient following the 3-step process:
   * 1. Create a temporary fax
   * 2. Upload attachment
   * 3. Send the temporary fax
   * 
   * @param params The fax parameters
   * @returns The HumbleFax API response
   */
  async sendFax(params: HumbleFaxSendParams): Promise<HumbleFaxResponse> {
    try {
      console.log('Sending fax with params:', {
        to: params.to,
        documentUrl: params.documentUrl,
        metadata: params.metadata,
        coverSheet: params.coverSheet
      });
      
      // Step 1: Create a temporary fax
      const includeCoversheet = params.coverSheet ? params.coverSheet.includeCoversheet : true;
      
      // Create a very short UUID to stay under 100 char limit
      const uuid = "fax-" + Math.random().toString(36).substring(2, 7);
      
      // The API requires all these fields, so ensure they're all strings
      const tmpFaxParams: CreateTmpFaxParams = {
        recipients: [this.formatPhoneNumber(params.to) || params.to],
        includeCoversheet,
        fromName: String(params.coverSheet?.fromName || "Referral Genie"),
        toName: String(params.coverSheet?.toName || "Provider"),
        subject: String(params.coverSheet?.subject || "Referral Information"),
        message: String(params.coverSheet?.message || "Please see the attached referral information."),
        fromNumber: this.formatPhoneNumber(params.coverSheet?.fromNumber) || "17045695946",
        companyInfo: String(params.coverSheet?.companyInfo || ""),
        pageSize: "Letter", // Must be one of: Letter, Legal, A4, B4
        resolution: "Fine",
        uuid: uuid // Using simple generated UUID to avoid length issues
      };
      
      console.log('Creating temporary fax with params:', tmpFaxParams);
      
      const tmpFaxResult = await this.createTmpFax(tmpFaxParams);
      
      if (!tmpFaxResult.success || !tmpFaxResult.tmpFaxId) {
        console.error('Failed to create temporary fax:', tmpFaxResult.error);
        return {
          success: false,
          error: tmpFaxResult.error || 'Failed to create temporary fax'
        };
      }
      
      const tmpFaxId = tmpFaxResult.tmpFaxId;
      console.log(`Successfully created temporary fax with ID: ${tmpFaxId}`);
      
      // Step 2: Upload attachment from document URL
      if (params.documentUrl) {
        console.log(`Uploading attachment from URL: ${params.documentUrl}`);
        const uploadResult = await this.uploadAttachment(tmpFaxId, params.documentUrl);
        
        if (!uploadResult.success) {
          console.error('Failed to upload attachment:', uploadResult.error);
          return {
            success: false,
            error: uploadResult.error || 'Failed to upload document'
          };
        }
        
        console.log('Successfully uploaded attachment');
      }
      
      // Step 3: Send the temporary fax
      console.log(`Sending temporary fax with ID: ${tmpFaxId}`);
      const sendResult = await this.sendTmpFax(tmpFaxId);
      
      if (sendResult.success) {
        // Force a faxId if none was returned (use the tmpFaxId as a fallback)
        const faxId = sendResult.faxId || tmpFaxId;
        console.log(`Successfully sent fax with ID: ${faxId}`);
        
        return {
          success: true,
          faxId: faxId,
          status: 'sent',
          data: sendResult.data
        };
      }
      
      console.error('Failed to send temporary fax:', sendResult.error);
      return sendResult;
    } catch (error) {
      console.error('Error sending fax:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('API Error response:', error.response.data);
        console.log('API Error status:', error.response.status);
        
        return {
          success: false,
          error: error.response.data.error || 'Unknown error',
          status: error.response.status.toString()
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Create a temporary fax
   * @param params The create temporary fax parameters
   * @returns The HumbleFax API response
   */
  private async createTmpFax(params: CreateTmpFaxParams): Promise<HumbleFaxResponse> {
    try {
      console.log(`Creating temporary fax at ${this.apiUrl}/tmpFax`);
      const response = await axios.post(`${this.apiUrl}/tmpFax`, params, {
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('CreateTmpFax API response:', response.data);
      
      if (response.data && response.data.data && response.data.data.tmpFax) {
        return {
          success: true,
          tmpFaxId: response.data.data.tmpFax.id,
          data: response.data
        };
      }
      
      return {
        success: false,
        error: 'Invalid API response format'
      };
    } catch (error) {
      console.error('Error creating temporary fax:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('API Error response:', error.response.data);
        console.log('API Error status:', error.response.status);
        console.log('API URL used:', `${this.apiUrl}/tmpFax`);
        
        return {
          success: false,
          error: error.response.data.error || 'Unknown error',
          status: error.response.status.toString()
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Send a temporary fax
   * @param tmpFaxId The ID of the temporary fax to send
   * @returns The HumbleFax API response
   */
  private async sendTmpFax(tmpFaxId: string): Promise<HumbleFaxResponse> {
    try {
      console.log(`Sending temporary fax at ${this.apiUrl}/tmpFax/${tmpFaxId}/send`);
      const response = await axios.post(`${this.apiUrl}/tmpFax/${tmpFaxId}/send`, {}, {
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        },
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      console.log('SendTmpFax API response:', response.data);
      
      // Extract the correct faxId from the response
      // The response contains a sentFax object with an id property
      let faxId = null;
      
      if (response.data && response.data.data && response.data.data.sentFax && response.data.data.sentFax.id) {
        // This is the actual sentFax ID we need to use for status checking
        faxId = response.data.data.sentFax.id;
        console.log(`Extracted actual sentFax ID: ${faxId}`);
      } else if (response.data && response.data.faxId) {
        faxId = response.data.faxId;
      } else if (response.data && response.data.id) {
        faxId = response.data.id;
      } else {
        // Fallback to tmpFaxId if we can't extract an ID
        faxId = tmpFaxId;
      }
      
      console.log(`Using faxId: ${faxId} for status checking`);
      
      return {
        success: true,
        faxId: faxId,
        status: 'sent', // Default initial status
        data: response.data
      };
    } catch (error) {
      console.error('Error sending temporary fax:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('API Error response:', error.response.data);
        console.log('API Error status:', error.response.status);
        console.log('API URL used:', `${this.apiUrl}/tmpFax/${tmpFaxId}/send`);
        
        return {
          success: false,
          error: error.response.data.error || 'Unknown error',
          status: error.response.status.toString()
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Upload an attachment to a temporary fax
   * @param tmpFaxId The ID of the temporary fax
   * @param fileUrl The URL of the file to upload
   * @returns The HumbleFax API response
   */
  async uploadAttachment(tmpFaxId: string, fileUrl: string): Promise<HumbleFaxResponse> {
    try {
      console.log(`Uploading attachment to ${this.apiUrl}/attachment/${tmpFaxId}`);
      console.log(`Attempting to download file from: ${fileUrl}`);
      
      // First download the file from URL to a temporary location
      const fileName = fileUrl.split('/').pop() || 'document.pdf';
      const tempFilePath = join(tmpdir(), fileName);
      
      try {
        // Try to download the file
        const fileResponse = await axios.get(fileUrl, { responseType: 'stream' });
        const writer = createWriteStream(tempFilePath);
        await pipeline(fileResponse.data, writer);
        console.log(`Successfully downloaded file to: ${tempFilePath}`);
      } catch (downloadError) {
        console.error('Failed to download file from URL:', fileUrl);
        console.error('Download error:', downloadError);
        
        // If download fails, try to read from local filesystem
        if (fileUrl.startsWith('/uploads/')) {
          const localPath = join(process.cwd(), 'public', fileUrl);
          console.log(`Attempting to read from local path: ${localPath}`);
          
          try {
            // Check if file exists locally
            const { readFile } = await import('fs/promises');
            const fileBuffer = await readFile(localPath);
            await writeFile(tempFilePath, fileBuffer);
            console.log(`Successfully read file from local filesystem`);
          } catch (localError) {
            console.error('Failed to read file from local filesystem:', localError);
            throw new Error(`File not accessible: ${fileUrl}`);
          }
        } else {
          throw downloadError;
        }
      }
      
      // Create form data for the file upload
      const form = new FormData();
      // Use 'file' as the field name - this is what HumbleFax expects
      form.append('file', createReadStream(tempFilePath), fileName);
      
      console.log(`Form data prepared with file: ${fileName}`);
      console.log(`Uploading to URL: ${this.apiUrl}/attachment/${tmpFaxId}`);
      
      // Upload to HumbleFax
      const response = await axios.post(`${this.apiUrl}/attachment/${tmpFaxId}`, form, {
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        },
        headers: {
          ...form.getHeaders()
        }
      });
      
      console.log('Upload attachment API response:', response.data);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('Error uploading attachment:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('API Error response:', error.response.data);
        console.log('API Error status:', error.response.status);
        console.log('API URL used:', `${this.apiUrl}/attachment/${tmpFaxId}`);
        
        return {
          success: false,
          error: error.response.data.error || 'Unknown error',
          status: error.response.status.toString(),
          details: error.response.data
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Check the status of a fax - Note: Not using /sentFax endpoint for now
   * @param faxId The ID of the fax to check
   * @returns The HumbleFax API response
   */
  async checkFaxStatus(faxId: string): Promise<HumbleFaxResponse> {
    try {
      console.log(`Checking fax status at ${this.apiUrl}/fax/${faxId}/status`);
      const response = await axios.get(`${this.apiUrl}/fax/${faxId}/status`, {
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        }
      });
      
      console.log('CheckFaxStatus API response:', response.data);
      
      return {
        success: true,
        status: response.data.status,
        data: response.data
      };
    } catch (error) {
      console.error('Error checking fax status:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('API Error response:', error.response.data);
        console.log('API Error status:', error.response.status);
        console.log('API URL used:', `${this.apiUrl}/fax/${faxId}/status`);
        
        // If the error is a 404, it might just mean the fax is still processing
        if (error.response.status === 404) {
          console.log('Fax status not found yet, may still be processing');
          return {
            success: true,
            status: 'processing',
            error: 'Fax is still processing'
          };
        }
        
        return {
          success: false,
          error: error.response.data.error || 'Unknown error',
          status: error.response.status.toString()
        };
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
} 
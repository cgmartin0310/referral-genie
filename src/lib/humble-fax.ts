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
      // If user provided a display fax number, append it to company info
      let companyInfo = String(params.coverSheet?.companyInfo || "");
      if (params.coverSheet?.fromNumber) {
        const displayFaxNumber = params.coverSheet.fromNumber;
        companyInfo = companyInfo ? `${companyInfo} | Fax: ${displayFaxNumber}` : `Fax: ${displayFaxNumber}`;
      }
      
      const tmpFaxParams: CreateTmpFaxParams = {
        recipients: [this.formatPhoneNumber(params.to) || params.to],
        includeCoversheet,
        fromName: String(params.coverSheet?.fromName || "Referral Genie"),
        toName: String(params.coverSheet?.toName || "Provider"),
        subject: String(params.coverSheet?.subject || "Referral Information"),
        message: String(params.coverSheet?.message || "Please see the attached referral information."),
        // Always use the authorized HumbleFax number for sending
        fromNumber: "19103974373",
        companyInfo: companyInfo,
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
   * Alternative method: Send a fax with attachment in a single request
   * This method tries to send the fax with the attachment included directly
   * @param params The fax send parameters
   * @returns The HumbleFax API response
   */
  async sendFaxDirect(params: HumbleFaxSendParams): Promise<HumbleFaxResponse> {
    try {
      console.log('Attempting direct fax send with attachment...');
      
      // Download and prepare the file
      const fileName = params.documentUrl.split('/').pop() || 'document.pdf';
      const tempFilePath = join(tmpdir(), fileName);
      
      try {
        // Try to download the file
        const fileResponse = await axios.get(params.documentUrl, { responseType: 'stream' });
        const writer = createWriteStream(tempFilePath);
        await pipeline(fileResponse.data, writer);
        console.log(`Successfully downloaded file to: ${tempFilePath}`);
      } catch (downloadError) {
        console.error('Failed to download file from URL:', params.documentUrl);
        
        // If download fails, try to read from local filesystem
        if (params.documentUrl.startsWith('/uploads/')) {
          const localPath = join(process.cwd(), 'public', params.documentUrl);
          console.log(`Attempting to read from local path: ${localPath}`);
          
          try {
            const { readFile } = await import('fs/promises');
            const fileBuffer = await readFile(localPath);
            await writeFile(tempFilePath, fileBuffer);
            console.log(`Successfully read file from local filesystem`);
          } catch (localError) {
            console.error('Failed to read file from local filesystem:', localError);
            throw new Error(`File not accessible: ${params.documentUrl}`);
          }
        } else {
          throw downloadError;
        }
      }
      
      // Create form data with all parameters
      const form = new FormData();
      form.append('to', params.to);
      form.append('file', createReadStream(tempFilePath), fileName);
      
      if (params.coverSheet?.includeCoversheet) {
        form.append('includeCoversheet', 'true');
        form.append('fromName', params.coverSheet.fromName || '');
        form.append('fromNumber', params.coverSheet.fromNumber || '');
        form.append('toName', params.coverSheet.toName || '');
        form.append('subject', params.coverSheet.subject || '');
        form.append('message', params.coverSheet.message || '');
      }
      
      // Try direct send endpoint
      console.log(`Attempting direct send to ${this.apiUrl}/send`);
      const response = await axios.post(`${this.apiUrl}/send`, form, {
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        },
        headers: {
          ...form.getHeaders()
        }
      });
      
      console.log('Direct send API response:', response.data);
      
      return {
        success: true,
        faxId: response.data.faxId || response.data.id,
        data: response.data
      };
    } catch (error) {
      console.error('Error in direct fax send:', error);
      
      if (axios.isAxiosError(error) && error.response) {
        console.log('Direct send error response:', error.response.data);
        console.log('Direct send error status:', error.response.status);
        
        return {
          success: false,
          error: error.response.data.error || 'Direct send failed',
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
        if (fileUrl.startsWith('/uploads/') || fileUrl.includes('/uploads/')) {
          // Extract just the path portion if it's a full URL
          let uploadPath = fileUrl;
          if (fileUrl.includes('://')) {
            const urlParts = new URL(fileUrl);
            uploadPath = urlParts.pathname;
          }
          
          const localPath = join(process.cwd(), 'public', uploadPath);
          console.log(`Attempting to read from local path: ${localPath}`);
          
          try {
            // Check if file exists locally
            const { readFile, access } = await import('fs/promises');
            await access(localPath); // This will throw if file doesn't exist
            console.log(`File exists at: ${localPath}`);
            
            const fileBuffer = await readFile(localPath);
            console.log(`File size: ${fileBuffer.length} bytes`);
            await writeFile(tempFilePath, fileBuffer);
            console.log(`Successfully read file from local filesystem`);
          } catch (localError) {
            console.error('Failed to read file from local filesystem:', localError);
            console.error(`File path attempted: ${localPath}`);
            console.error(`Current working directory: ${process.cwd()}`);
            
            // List files in uploads directory for debugging
            try {
              const { readdir } = await import('fs/promises');
              const uploadsDir = join(process.cwd(), 'public', 'uploads');
              const files = await readdir(uploadsDir);
              console.log(`Files in uploads directory: ${files.join(', ')}`);
            } catch (dirError) {
              console.error('Could not list uploads directory:', dirError);
            }
            
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
        console.log('Response headers:', error.response.headers);
        console.log('Full error details:', JSON.stringify(error.response.data, null, 2));
        
        // Check if it's a 404 and provide more specific error
        if (error.response.status === 404) {
          return {
            success: false,
            error: 'Attachment upload endpoint not found. The temporary fax may have expired or the endpoint may be incorrect.',
            status: '404',
            details: error.response.data
          };
        }
        
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

  /**
   * Test API connectivity
   * @returns The HumbleFax API response
   */
  async testConnection(): Promise<HumbleFaxResponse> {
    try {
      console.log(`Testing API connection to ${this.apiUrl}`);
      
      // Try a simple authenticated request
      const response = await axios.get(`${this.apiUrl}/account`, {
        auth: {
          username: this.apiKey,
          password: this.apiSecret
        },
        timeout: 10000 // 10 second timeout
      });
      
      console.log('API connection test response:', response.data);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('API connection test failed:', error);
      
      if (axios.isAxiosError(error)) {
        if (error.code === 'ECONNREFUSED') {
          return {
            success: false,
            error: 'Connection refused - API may be unreachable from this environment'
          };
        }
        
        if (error.response) {
          return {
            success: false,
            error: `API responded with status ${error.response.status}`,
            status: error.response.status.toString()
          };
        }
        
        if (error.request) {
          return {
            success: false,
            error: 'No response from API - possible network issue'
          };
        }
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown connection error'
      };
    }
  }
} 
/**
 * Database utility functions for error handling and retries
 */

const MAX_RETRIES = 5;
const BASE_DELAY = 1000; // 1 second

/**
 * Execute a database operation with retry logic for connection issues
 */
export async function executeWithRetry<T>(operation: () => Promise<T>, retryCount = 0): Promise<T> {
  try {
    return await operation();
  } catch (error: any) {
    // Only retry on database connection errors
    if (retryCount < MAX_RETRIES && error?.message?.includes("Can't reach database server")) {
      // Exponential backoff with jitter
      const delay = Math.min(
        BASE_DELAY * Math.pow(2, retryCount) * (0.5 + Math.random() * 0.5),
        30000 // Max 30 seconds
      );
      
      console.log(`Database connection failed. Retrying in ${Math.round(delay / 1000)}s... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return executeWithRetry(operation, retryCount + 1);
    }
    
    // For other errors or if max retries reached, rethrow
    if (retryCount === MAX_RETRIES) {
      console.error('Database operation failed after all retry attempts:', error);
    }
    
    throw error;
  }
} 
/**
 * Format a date string into a readable format
 */
export function formatDate(dateString: string): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

/**
 * Format a date for input field (YYYY-MM-DD)
 */
export function formatDateForInput(dateString: string | Date | null): string {
  if (!dateString) return '';
  
  const date = new Date(dateString);
  
  // Generate YYYY-MM-DD format
  return date.toISOString().split('T')[0];
} 
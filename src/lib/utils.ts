/**
 * Parse a date string as local date (not UTC)
 */
export function parseLocalDate(dateString: string): Date {
  // If the date string is in YYYY-MM-DD format, parse it as local date
  if (dateString.match(/^\d{4}-\d{2}-\d{2}$/)) {
    const [year, month, day] = dateString.split('-').map(Number);
    // Create date at noon local time to avoid timezone edge cases
    return new Date(year, month - 1, day, 12, 0, 0);
  }
  
  // Otherwise, parse normally
  return new Date(dateString);
}

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
  
  // Get the date in local timezone
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
} 
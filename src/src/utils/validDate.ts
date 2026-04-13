export function isValidDateString(date: string): boolean {
    // YYYY-MM-DD
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return false;
    }
    
    const d = new Date(date);
    return d instanceof Date && !isNaN(d.getTime());
  }

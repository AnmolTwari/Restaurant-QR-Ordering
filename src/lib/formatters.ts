/**
 * Utility functions for formatting values across client and server
 */

/**
 * Format minor currency units (paise, cents) to formatted currency string (e.g. 25000 -> ₹250.00)
 */
export function formatMoney(minorUnits: number, currency = 'INR'): string {
  const major = (minorUnits / 100).toFixed(2);
  switch (currency) {
    case 'INR':
      return `₹${major}`;
    case 'USD':
      return `$${major}`;
    case 'EUR':
      return `€${major}`;
    case 'GBP':
      return `£${major}`;
    default:
      return `${currency} ${major}`;
  }
}

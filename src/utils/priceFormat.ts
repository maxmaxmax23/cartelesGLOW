/**
 * Formats a live Price text input value into "$#.###.###" with no decimals.
 * Typing digits appends cleanly; backspacing a formatted value like "$5.290" -> "$5.29"
 * extracts digits "529" -> "$529" without accidentally stripping ".29" as cents.
 */
export function formatPriceInput(raw: string): string {
  if (!raw) return '';

  let cleaned = raw.trim();

  // Strip explicit decimal comma tail (e.g. pasted "52900,00" or "$1.500.000,50")
  if (/,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/,\d{1,2}$/, '');
  } else if (!cleaned.startsWith('$') && /^\d[\d,]*\.\d{1,2}$/.test(cleaned)) {
    // Strip decimal dot tail on pasted raw numbers without $ (e.g. "52900.00" or "1,250.50")
    cleaned = cleaned.replace(/\.\d{1,2}$/, '');
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  const normalized = digits.replace(/^0+(?=\d)/, '');
  const grouped = normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${grouped}`;
}

/**
 * Normalizes catalog price strings (from Excel, CSV, JSON) into "$#.###.###" without decimals.
 */
export function formatCatalogPrice(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';

  if (!/\d/.test(trimmed)) {
    return trimmed;
  }

  let cleaned = trimmed;
  if (/,\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/,\d{1,2}$/, '');
  } else if (/^\$?\s*[\d,]*\.\d{1,2}$/.test(cleaned)) {
    cleaned = cleaned.replace(/\.\d{1,2}$/, '');
  }

  const digits = cleaned.replace(/\D/g, '');
  if (!digits) return '';

  const normalized = digits.replace(/^0+(?=\d)/, '');
  const grouped = normalized.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${grouped}`;
}

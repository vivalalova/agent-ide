export function formatName(first, last) {
  return `${first} ${last}`;
}

export function calculateTotal(items) {
  return items.reduce((sum, item) => sum + item.price, 0);
}

export const DEFAULT_LOCALE = 'en-US';

/**
 * Date Utils
 */

export function parseDate(dateString: string): Date {
  return new Date(dateString);
}

export function formatISODate(date: Date): string {
  return date.toISOString();
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setMonth(result.getMonth() + months);
  return result;
}

export function addYears(date: Date, years: number): Date {
  const result = new Date(date);
  result.setFullYear(result.getFullYear() + years);
  return result;
}

export function diffInDays(date1: Date, date2: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.floor((date2.getTime() - date1.getTime()) / msPerDay);
}

export function isToday(date: Date): boolean {
  const today = new Date();
  return date.toDateString() === today.toDateString();
}

export function isFuture(date: Date): boolean {
  return date > new Date();
}

export function isPast(date: Date): boolean {
  return date < new Date();
}

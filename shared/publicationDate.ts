// Shared by the official provider and UI. Preserve the calendar date without timezone shifts.
export function normalizePublicationDate(value: unknown): string | undefined {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const match = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?(T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d))?$/.exec(String(value).trim());
  if (!match || Number(match[1]) === 0 || (match[4] && !match[3])) return undefined;
  const [, year, month, day] = match;
  if (month && (Number(month) < 1 || Number(month) > 12)) return undefined;
  const leapYear = Number(year) % 4 === 0 && (Number(year) % 100 !== 0 || Number(year) % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day && (Number(day) < 1 || Number(day) > daysInMonth[Number(month) - 1])) return undefined;
  return [year, month, day].filter(Boolean).join('-');
}
export function publicationYear(value: unknown): string | undefined {
  return normalizePublicationDate(value)?.slice(0, 4);
}

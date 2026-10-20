export const STORE_TIME_ZONE = 'America/Sao_Paulo';
type Instant = Date | string | number;
const dateParts = new Intl.DateTimeFormat('en-CA', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: STORE_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: STORE_TIME_ZONE, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fullTimeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: STORE_TIME_ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const date = (value: Instant) => value instanceof Date ? value : new Date(value);

export const formatStoreDate = (value: Instant) => dateFormat.format(date(value));
export const formatStoreDateTime = (value: Instant) => dateTimeFormat.format(date(value));
export const formatStoreTime = (value: Instant, seconds = false) => (seconds ? fullTimeFormat : timeFormat).format(date(value));

export function storeDateKey(value: Instant): string {
  const parts = dateParts.formatToParts(date(value));
  const part = (name: string) => parts.find(item => item.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** First instant of the store's day, independent of the browser zone and historical DST. */
export function startOfStoreDay(now: Date): Date {
  const key = storeDateKey(now);
  const [year, month, day] = key.split('-').map(Number);
  const utcMidnight = Date.UTC(year, month - 1, day);
  let low = utcMidnight - 86400000, high = utcMidnight + 2 * 86400000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (storeDateKey(middle) < key) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

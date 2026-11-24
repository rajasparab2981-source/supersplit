// Device-local preferences. These never sync between devices.
// "Who am I" now comes from the signed-in account; UPI IDs come from profiles,
// with this map as a fallback for people who haven't joined yet.

const UPI_KEY = 'splitpro_upi_v1'; // { memberName: upiId }

export type UpiMap = Record<string, string>;

function read<T extends object>(key: string): T {
  try { return JSON.parse(localStorage.getItem(key) || '{}') as T; } catch { return {} as T; }
}
function write(key: string, value: object): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const loadUpiMap = (): UpiMap => read<UpiMap>(UPI_KEY);
export const saveUpiMap = (m: UpiMap): void => write(UPI_KEY, m);

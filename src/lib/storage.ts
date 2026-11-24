// Device-local preferences. These never sync between devices.
// (Phase 3 moves "who am I" and UPI IDs onto the signed-in user's profile.)

const SELF_KEY = 'splitpro_self_v1'; // { groupId: memberName }
const UPI_KEY = 'splitpro_upi_v1'; // { memberName: upiId }

export type SelfMap = Record<string, string>;
export type UpiMap = Record<string, string>;

function read<T extends object>(key: string): T {
  try { return JSON.parse(localStorage.getItem(key) || '{}') as T; } catch { return {} as T; }
}
function write(key: string, value: object): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked */ }
}

export const loadSelf = (): SelfMap => read<SelfMap>(SELF_KEY);
export const saveSelf = (m: SelfMap): void => write(SELF_KEY, m);
export const loadUpiMap = (): UpiMap => read<UpiMap>(UPI_KEY);
export const saveUpiMap = (m: UpiMap): void => write(UPI_KEY, m);

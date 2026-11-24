// UPI deep links: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tn=<note>

export interface UpiPayment {
  vpa: string;
  name: string;
  amount: number;
  note?: string;
}

export function buildUpiUri({ vpa, name, amount, note }: UpiPayment): string {
  const params = new URLSearchParams();
  params.set('pa', vpa);
  params.set('pn', name);
  params.set('am', Number(amount).toFixed(2));
  params.set('cu', 'INR');
  if (note) params.set('tn', note);
  return 'upi://pay?' + params.toString();
}

export function isValidVpa(vpa: string): boolean {
  return /^[\w.-]{2,}@[\w.-]{2,}$/.test(vpa.trim());
}

export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
}

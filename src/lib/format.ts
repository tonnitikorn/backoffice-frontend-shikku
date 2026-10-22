export function formatMoney(satang: number | undefined | null): string {
  if (satang === undefined || satang === null) return '-';
  return (satang / 100).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function bahtToSatang(baht: number): number {
  return Math.round(baht * 100);
}

export function formatDateTime(iso: string | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso: string | Date | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('th-TH', { dateStyle: 'medium' });
}

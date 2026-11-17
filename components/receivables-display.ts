export const arThousands = (amount: number) => amount / 1000;

export const arUnit = (currency: string) => `k${currency}`;

export function arAmountFormatter(locale: string) {
  const number = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 0,
  });
  return (amount: number | null) => {
    if (amount === null) return "—";
    const thousands = arThousands(amount);
    return number.format(Math.abs(thousands) < 0.5 ? 0 : thousands);
  };
}

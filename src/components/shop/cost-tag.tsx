import "./shop.css";

/** A small coin and a number, for buttons that cost coins. */
export function CostTag({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={`cost-tag${className ? ` ${className}` : ""}`} aria-label={`${amount} coins`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/coins/coin.svg" alt="" aria-hidden width={16} height={16} />
      <b>{amount.toLocaleString("en-IN")}</b>
    </span>
  );
}

import "./shop.css";

/**
 * The coin, redrawn for small sizes.
 *
 * The full artwork in /coins/coin.svg is lit for 32px and up; at 16px its gradients and its
 * pale-gold spade sit too close to the gold face and the whole thing reads as a blank disc.
 * This one is built from four flat shapes that survive a 16px raster: a thick dark rim, a gold
 * face, a shaded lower half, and a spade struck in the same near-black as the rim, sized to keep
 * a clear ring of gold around it. The dark rim is also what separates the coin from the gold
 * "play vs computer" button, where a gold-on-gold coin would otherwise disappear.
 */
function SmallCoin() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden focusable="false">
      <circle cx="8" cy="8" r="7.5" fill="#2a1705" />
      <circle cx="8" cy="8" r="6.2" fill="#ffd44f" />
      <path d="M1.8 8a6.2 6.2 0 0 0 12.4 0Z" fill="#e8a416" />
      <path
        d="M3.6 5.6a5.6 5.6 0 0 1 3.1-2.9"
        fill="none"
        stroke="#fff3c0"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M8 4.2C9.6 6.1 11.4 7.3 11.4 9.05C11.4 10.45 10.1 11.05 9 10.35L9.95 12.3L6.05 12.3L7 10.35C5.9 11.05 4.6 10.45 4.6 9.05C4.6 7.3 6.4 6.1 8 4.2Z"
        fill="#2a1705"
      />
    </svg>
  );
}

/** A small coin and a number, for buttons that cost coins. */
export function CostTag({ amount, className }: { amount: number; className?: string }) {
  return (
    <span className={`cost-tag${className ? ` ${className}` : ""}`} aria-label={`${amount} coins`}>
      <SmallCoin />
      <b>{amount.toLocaleString("en-IN")}</b>
    </span>
  );
}

export const Chevron = ({ dir }: { dir: "left" | "right" }) => (
  <svg viewBox="0 0 24 24" aria-hidden className="chevron">
    <path d={dir === "left" ? "M15 4 L7 12 L15 20" : "M9 4 L17 12 L9 20"} />
  </svg>
);

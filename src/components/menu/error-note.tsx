/** A calm error message: a small warning mark and plain words, on a dark red panel. */
export function ErrorNote({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p role="alert" className={`error-note ${className ?? ""}`}>
      <svg viewBox="0 0 24 24" aria-hidden>
        <path d="M12 3.5 2.8 19.5h18.4L12 3.5Z" />
        <path d="M12 10v4.5M12 17.4h.01" />
      </svg>
      <span>{children}</span>
    </p>
  );
}

/** Server and network errors in plain words. */
export function friendlyError(message: string) {
  if (/exist|not found/i.test(message))
    return { title: "Table not found", body: "This table has closed, or the game was restarted. Ask your friend for a fresh code, or start a new table yourself." };
  if (/reach|network|fetch/i.test(message))
    return { title: "No connection", body: "Can't reach the table. Check you're on the same Wi-Fi as the host and try again." };
  if (/too many requests/i.test(message)) return { title: "One moment", body: "Lots of tapping just now. Wait a few seconds and try again." };
  if (/not at this table/i.test(message))
    return { title: "You left this table", body: "Your seat here has gone (you may have left, or opened the table on another phone). Join again with the code." };
  if (/full/i.test(message)) return { title: "Table is full", body: message };
  return { title: "Couldn't open the table", body: message };
}

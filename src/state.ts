// state/watchlist.ts
export const watchlist = new Map<
  string,
  {
    token: any;
    controller: AbortController;
    startedAt: number;
  }
>(); 

export const tokens = [...watchlist.entries()].map(([mint, entry]) => ({
  mint,
  ...entry.token,
}));

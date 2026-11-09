"use strict";

function arcadeRecord(key) {
  let best = 0;
  try {
    const saved = Number(localStorage.getItem(key));
    if (Number.isSafeInteger(saved) && saved > 0) best = saved;
  } catch {
    /* Scores remain available for this session. */
  }
  return {
    get value() {
      return best;
    },
    save(score) {
      if (score <= best) return;
      best = score;
      try {
        localStorage.setItem(key, String(best));
      } catch {
        /* Storage is optional. */
      }
    },
  };
}

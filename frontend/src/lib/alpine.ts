/**
 * Alpine.js island bootstrap (user-directed stack addition).
 *
 * Alpine owns ONE island: the status-bar ticker ("Saved N seconds ago"),
 * which mutates its own DOM every second. Owning it in React would force a
 * re-render per second of the entire planner tree; Alpine mutates two text
 * nodes directly, so React never re-renders for the clock.
 *
 * React → island communication is one-way via a `mg:status` DOM event, so
 * the island stays a black box to React's reconciler (initTree/destroyTree
 * bound the island's lifetime; React never reconciles inside it).
 */

import Alpine from "alpinejs";
import type { Alpine as AlpineType } from "alpinejs";

declare global {
  interface Window {
    Alpine?: AlpineType;
  }
}

let started = false;

/** Register components and start Alpine exactly once per page load. */
export function ensureAlpine(): void {
  if (started) return;
  started = true;
  window.Alpine = Alpine;

  Alpine.data("mgTicker", () => ({
    city: "Untitled City",
    savedAt: null as number | null,
    elapsed: 0,
    _timer: 0,
    _onStatus: null as ((event: Event) => void) | null,

    get savedLabel(): string {
      if (this.savedAt === null) return "Not saved yet";
      if (this.elapsed < 5) return "Saved just now";
      if (this.elapsed < 60) return `Saved ${this.elapsed} seconds ago`;
      const minutes = Math.floor(this.elapsed / 60);
      return minutes === 1 ? "Saved 1 minute ago" : `Saved ${minutes} minutes ago`;
    },

    init() {
      this._onStatus = (event: Event) => {
        const detail = (event as CustomEvent).detail as {
          city?: string | null;
          savedAt?: number | null;
        };
        if (detail?.city !== undefined) {
          this.city = detail.city ? detail.city : "Untitled City";
        }
        if (detail?.savedAt) {
          this.savedAt = Math.floor(detail.savedAt / 1000);
          this.elapsed = Math.max(0, Math.floor(Date.now() / 1000) - this.savedAt);
        }
      };
      window.addEventListener("mg:status", this._onStatus);
      this._timer = window.setInterval(() => {
        if (this.savedAt !== null) {
          this.elapsed = Math.max(0, Math.floor(Date.now() / 1000) - this.savedAt);
        }
      }, 1000);
    },

    destroy() {
      if (this._onStatus) window.removeEventListener("mg:status", this._onStatus);
      if (this._timer) window.clearInterval(this._timer);
    },
  }));

  Alpine.start();
}

/** One-way React → island push (status bar data). */
export function pushCityStatus(detail: {
  city?: string | null;
  savedAt?: number | null;
}): void {
  window.dispatchEvent(new CustomEvent("mg:status", { detail }));
}

/** Mount an Alpine island into `host`; returns an unmount cleanup. */
export function mountAlpineIsland(host: HTMLElement, html: string): () => void {
  ensureAlpine();
  host.innerHTML = html;
  Alpine.initTree(host);
  return () => {
    Alpine.destroyTree(host);
    host.innerHTML = "";
  };
}

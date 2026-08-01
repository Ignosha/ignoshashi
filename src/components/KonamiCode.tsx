import { useEffect } from "react";

/**
 * Konami Code Easter Egg
 * ↑ ↑ ↓ ↓ ← → ← → B A
 *
 * Triggers a massive coin rain + "GOD MODE ACTIVATED" message.
 * Listens for the Konami code key sequence globally.
 */

const KONAMI_SEQUENCE = [
  "ArrowUp",
  "ArrowUp",
  "ArrowDown",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "ArrowLeft",
  "ArrowRight",
  "KeyB",
  "KeyA",
];

let sequenceIndex = 0;

function resetSequence() {
  sequenceIndex = 0;
}

// Cleanup after a delay
function scheduleReset() {
  setTimeout(resetSequence, 3000);
}

export function useKonamiCode(onActivated: () => void): void {
  useEffect(() => {
    if (typeof window === "undefined") return;

    function handleKeyDown(e: KeyboardEvent) {
      const expected = KONAMI_SEQUENCE[sequenceIndex];

      if (e.code === expected) {
        sequenceIndex++;
        if (sequenceIndex === KONAMI_SEQUENCE.length) {
          // Konami code complete!
          resetSequence();
          onActivated();
        }
        scheduleReset();
      } else {
        resetSequence();
        // Allow restarting from the beginning
        if (e.code === KONAMI_SEQUENCE[0]) {
          sequenceIndex = 1;
          scheduleReset();
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onActivated]);
}

/**
 * Konami code event key for dispatching/custom events across components.
 */
export const KONAMI_ACTIVATED_EVENT = "konami-activated";

export function triggerKonamiActivated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(KONAMI_ACTIVATED_EVENT));
}

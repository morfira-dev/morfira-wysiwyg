/** Return the exact inverse registration; lifecycle order stays with the caller. */
export const listenToUI = <K extends keyof HTMLElementEventMap>(target: EventTarget, type: K, listener: (event: HTMLElementEventMap[K]) => void, capture = false): (() => void) => {
  target.addEventListener(type, listener as EventListener, capture);
  return () => target.removeEventListener(type, listener as EventListener, capture);
};

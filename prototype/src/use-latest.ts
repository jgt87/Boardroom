import { useLayoutEffect, useRef } from 'react';

/**
 * Ref that always holds the latest value. Lets long-lived effects (key listeners, mount/unmount
 * hooks) call the current callback props without re-subscribing on every render.
 */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

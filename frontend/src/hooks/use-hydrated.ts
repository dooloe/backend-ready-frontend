import { useSyncExternalStore } from "react";
const subscribe = () => () => {};
// SSR controls stay disabled until React can handle their input.
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

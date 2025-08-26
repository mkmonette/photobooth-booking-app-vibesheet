export default function useLocalStorageSync<T>(
  key: string,
  initialValue: T | (() => T)
): [T, (value: SetStateAction<T>) => void] {
  const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
  const keyRef = useRef<string>(key);
  // Keep the initialValue stable to avoid re-subscribes; treat initialValue as effectively constant for this hook.
  const initialRef = useRef<T | (() => T)>(initialValue);

  const readInitial = useCallback((): T => {
    return typeof initialRef.current === 'function'
      ? (initialRef.current as () => T)()
      : (initialRef.current as T);
  }, []);

  const readFromStorage = useCallback((): T => {
    if (!isBrowser) {
      return readInitial();
    }

    try {
      const raw = window.localStorage.getItem(keyRef.current);
      if (raw === null) {
        return readInitial();
      }
      return JSON.parse(raw) as T;
    } catch {
      // If parsing or access fails, fall back to initial value
      return readInitial();
    }
  }, [isBrowser, readInitial]);

  const [state, setState] = useState<T>(readFromStorage);

  // Keep keyRef up-to-date and update state when key changes
  useEffect(() => {
    if (keyRef.current === key) return;
    keyRef.current = key;
    setState(readFromStorage());
  }, [key, readFromStorage]);

  // Write to localStorage and broadcast changes. Use functional setState to avoid capturing stale state.
  const setLocalState = useCallback(
    (value: SetStateAction<T>) => {
      setState((prev) => {
        const next = typeof value === 'function' ? (value as (p: T) => T)(prev) : value;

        if (isBrowser) {
          try {
            const serialized = JSON.stringify(next);
            window.localStorage.setItem(keyRef.current, serialized);
          } catch {
            // ignore write errors (quota, serialization)
          }

          // Dispatch a cross-component same-tab event ? listeners will update accordingly
          try {
            const event = new CustomEvent('local-storage', {
              detail: { key: keyRef.current, value: next },
            });
            window.dispatchEvent(event);
          } catch {
            // ignore if CustomEvent is not supported
          }
        }

        return next;
      });
    },
    [isBrowser]
  );

  useEffect(() => {
    if (!isBrowser) return;

    const handleStorage = (e: StorageEvent) => {
      if (e.key !== keyRef.current) return;

      try {
        if (e.newValue === null) {
          setState(readInitial());
        } else {
          const newValue = JSON.parse(e.newValue as string) as T;
          setState(newValue);
        }
      } catch {
        // parsing failed; ignore
      }
    };

    const handleCustom = (evt: Event) => {
      try {
        const custom = evt as CustomEvent<{ key: string; value: T }>;
        if (!custom?.detail || custom.detail.key !== keyRef.current) return;
        setState(custom.detail.value);
      } catch {
        // ignore
      }
    };

    window.addEventListener('storage', handleStorage);
    window.addEventListener('local-storage', handleCustom as EventListener);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('local-storage', handleCustom as EventListener);
    };
  }, [isBrowser, readInitial]);

  return [state, setLocalState];
}
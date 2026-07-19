const globalGenerationState = globalThis as typeof globalThis & {
  __aspGenerationLocks?: Map<string, Promise<unknown>>;
};

const locks =
  globalGenerationState.__aspGenerationLocks ??
  (globalGenerationState.__aspGenerationLocks = new Map());

/** Share one in-process AI request across concurrent identical callers. */
export function runGenerationOnce<T>(
  fingerprint: string,
  factory: () => Promise<T>
): Promise<T> {
  const existing = locks.get(fingerprint) as Promise<T> | undefined;
  if (existing) return existing;

  let pending: Promise<T>;
  try {
    pending = Promise.resolve(factory());
  } catch (error) {
    pending = Promise.reject(error);
  }
  locks.set(fingerprint, pending);

  const release = () => {
    if (locks.get(fingerprint) === pending) locks.delete(fingerprint);
  };
  void pending.then(release, release);
  return pending;
}

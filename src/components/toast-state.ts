export function appendToast<T>(current: T[], next: T) {
  return [...current, next].slice(-3);
}

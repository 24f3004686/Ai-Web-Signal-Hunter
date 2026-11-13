export type ThemeMode = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'signal_hunter_theme';

export function resolveInitialTheme(
  storedValue: string | null | undefined,
  prefersDark: boolean
): ThemeMode {
  if (storedValue === 'dark' || storedValue === 'light') {
    return storedValue;
  }
  return prefersDark ? 'dark' : 'light';
}

export function getNextTheme(current: ThemeMode): ThemeMode {
  return current === 'dark' ? 'light' : 'dark';
}

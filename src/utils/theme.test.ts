import test from 'node:test';
import assert from 'node:assert/strict';
import { getNextTheme, resolveInitialTheme } from './theme.ts';

test('resolveInitialTheme honors explicit stored preference over OS preference', () => {
  assert.equal(resolveInitialTheme('dark', false), 'dark');
  assert.equal(resolveInitialTheme('light', true), 'light');
});

test('resolveInitialTheme falls back to OS preference when storage is empty or invalid', () => {
  assert.equal(resolveInitialTheme(null, true), 'dark');
  assert.equal(resolveInitialTheme(undefined, false), 'light');
  assert.equal(resolveInitialTheme('sepia', true), 'dark');
});

test('getNextTheme toggles cleanly between light and dark', () => {
  assert.equal(getNextTheme('light'), 'dark');
  assert.equal(getNextTheme('dark'), 'light');
});

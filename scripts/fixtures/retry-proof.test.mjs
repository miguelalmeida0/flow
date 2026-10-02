import { test, expect } from 'vitest';
let attempt = 0;
test('configured retry is visible to the release gate', { retry: 1 }, () => {
  expect(++attempt).toBe(2);
});

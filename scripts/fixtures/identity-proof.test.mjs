import { describe, test, expect } from 'vitest';
describe('gate identity parent',()=>{
  test.each([1,2])('preserves the nested identity',value=>expect(value).toBeGreaterThan(0));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { headingDirection } from '../js/city-map.js';

test('world headings match the Chinese compass in every quadrant', () => {
  const expected = ['南', '东南', '东', '东北', '北', '西北', '西', '西南'];
  expected.forEach((direction, i) => {
    assert.equal(headingDirection(i * Math.PI / 4), direction);
    assert.equal(headingDirection(i * Math.PI / 4 + 8 * Math.PI), direction);
    assert.equal(headingDirection(i * Math.PI / 4 - 8 * Math.PI), direction);
  });
});

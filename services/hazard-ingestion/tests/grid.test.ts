import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { cellKey, cellsForBBox, CELL_SIZE_DEG } from '../../../shared/grid.ts';

describe('grid helpers', () => {
  it('cellKey returns consistent keys for same cell', () => {
    assert.equal(cellKey(26.182, 91.785), cellKey(26.185, 91.789));
  });

  it('cellKey returns different keys for different cells', () => {
    assert.notEqual(cellKey(26.18, 91.78), cellKey(26.20, 91.80));
  });

  it('cellKey handles negative coordinates', () => {
    const key = cellKey(-33.87, 151.21);
    assert.ok(key.includes('-'));
  });

  it('cellsForBBox returns correct number of cells', () => {
    // A 0.03° x 0.03° box should cover at least 3x3 cells (maybe 4x4 depending on alignment)
    const box = { minLat: 26.18, maxLat: 26.21, minLng: 91.78, maxLng: 91.81 };
    const cells = cellsForBBox(box);
    assert.ok(cells.length >= 9, `expected >= 9 cells, got ${cells.length}`);
  });

  it('cellsForBBox returns exactly 1 cell for a point', () => {
    const lat = 26.185;
    const lng = 91.785;
    const cells = cellsForBBox({ minLat: lat, maxLat: lat, minLng: lng, maxLng: lng });
    assert.equal(cells.length, 1);
    assert.equal(cells[0], cellKey(lat, lng));
  });

  it('cell boundaries are at CELL_SIZE_DEG intervals', () => {
    // Two points in adjacent cells
    const boundary = Math.floor(26.18 / CELL_SIZE_DEG) * CELL_SIZE_DEG + CELL_SIZE_DEG;
    const keyBelow = cellKey(boundary - 0.001, 91.0);
    const keyAbove = cellKey(boundary + 0.001, 91.0);
    assert.notEqual(keyBelow, keyAbove);
  });
});

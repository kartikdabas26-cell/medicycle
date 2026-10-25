import { describe, expect, it } from 'vitest';
import type { DrugBatch, Facility } from '../types';
import {
  checkForNetworkSurplus, daysUntilExpiry, findSafeTransferSuggestions, hasSixMonthShelfLife,
  forecastDemand, weightedAverage, type TransferCandidate,
} from './algorithms';

const hospital: Facility = {
  id: 'H-1', name: 'Central Hospital', facility_type: 'Hospital', location: 'Central',
};
const chemist: Facility = {
  id: 'C-1', name: 'Community Chemist', facility_type: 'Chemist', location: 'Central',
};
const batch: DrugBatch = {
  id: 'B-1', medicine_id: 'M-1', facility_id: hospital.id, batch_number: 'BATCH-1',
  quantity: 29, safety_stock: 5, expiry_date: '2026-01-20', unit_cost: 0.1,
};
const makeCandidate = (overrides: Partial<TransferCandidate> = {}): TransferCandidate => ({
  medicineId: 'M-1',
  batch,
  donor: hospital,
  recipient: chemist,
  donorQuantity: 50,
  recipientQuantity: 10,
  donorSafetyStock: 20,
  recipientSafetyStock: 40,
  recipientDailyConsumption: 2,
  transitDays: 3,
  ...overrides,
});

describe('demand forecasting', () => {
  it('weights recent periods more strongly and derives coverage', () => {
    expect(weightedAverage([10, 20, 30])).toBeCloseTo(23.3333, 3);
    expect(forecastDemand([70], 120)).toEqual({
      weightedAverageWeekly: 70,
      smoothedWeekly: 70,
      dailyConsumption: 10,
      daysOfSupply: 12,
      projectedDemand30Days: 300,
    });
  });

  it('rejects invalid forecasting inputs', () => {
    expect(() => weightedAverage([1, 2], [1])).toThrow(RangeError);
    expect(() => forecastDemand([-1], 10)).toThrow(RangeError);
    expect(() => forecastDemand([10], 5, 0)).toThrow(RangeError);
  });
});

describe('expiry-safe transfer matching', () => {
  it('caps transfer quantity by surplus, shortage, batch size and recipient burn rate', () => {
    const [suggestion] = findSafeTransferSuggestions(
      [makeCandidate()], new Map([['M-1', 0.1]]), new Date(2026, 0, 1),
    );
    expect(suggestion.quantity).toBe(29);
    expect(suggestion.estimatedSavings).toBe(2.9);
    expect(suggestion.daysToExpiry).toBe(19);
  });

  it('rejects stock that will expire before it can arrive or be consumed', () => {
    const shortExpiry = { ...batch, expiry_date: '2026-01-03' };
    expect(findSafeTransferSuggestions(
      [makeCandidate({ batch: shortExpiry })], new Map(), new Date(2026, 0, 1),
    )).toEqual([]);
    expect(() => daysUntilExpiry('2026-02-30', new Date(2026, 0, 1))).toThrow(RangeError);
  });

  it('requires a full six calendar months for patient listings', () => {
    const today = new Date(2026, 0, 1);
    expect(hasSixMonthShelfLife('2026-06-30', today)).toBe(false);
    expect(hasSixMonthShelfLife('2026-07-01', today)).toBe(true);
  });
});

describe('network surplus warnings', () => {
  it('only returns unexpired, near-date stock above the facility safety buffer', () => {
    const batches: DrugBatch[] = [
      batch,
      { ...batch, id: 'B-2', quantity: 5, safety_stock: 5 },
      { ...batch, id: 'B-3', quantity: 30, safety_stock: 0, expiry_date: '2026-05-02' },
      { ...batch, id: 'B-4', quantity: 30, safety_stock: 0, expiry_date: '2025-12-01' },
    ];
    expect(checkForNetworkSurplus('M-1', 10, batches, [hospital], new Date(2026, 0, 1))).toEqual([
      { facility: hospital, batch, availableQuantity: 10, daysToExpiry: 19 },
    ]);
    expect(() => checkForNetworkSurplus('M-1', 0, batches, [hospital])).toThrow(RangeError);
  });
});

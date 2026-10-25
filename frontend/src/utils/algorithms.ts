import type { DrugBatch, Facility, TransferOrder } from '../types';

export interface DemandSample {
  week: number;
  quantity: number;
}

export interface DemandForecast {
  weightedAverageWeekly: number;
  smoothedWeekly: number;
  dailyConsumption: number;
  daysOfSupply: number;
  projectedDemand30Days: number;
}

export interface TransferCandidate {
  medicineId: string;
  batch: DrugBatch;
  donor: Facility;
  recipient: Facility;
  donorQuantity: number;
  recipientQuantity: number;
  donorSafetyStock: number;
  recipientSafetyStock: number;
  recipientDailyConsumption: number;
  transitDays: number;
}

export interface TransferSuggestion {
  candidate: TransferCandidate;
  quantity: number;
  daysToExpiry: number;
  priorityScore: number;
  estimatedSavings: number;
}

export interface BuyingConflict {
  facility: Facility;
  batch: DrugBatch;
  availableQuantity: number;
  daysToExpiry: number;
}

export function weightedAverage(values: readonly number[], weights?: readonly number[]): number {
  if (values.some((value) => !Number.isFinite(value))) {
    throw new RangeError('Values must be finite numbers');
  }
  if (values.length === 0) return 0;
  const resolvedWeights = weights ?? values.map((_, index) => index + 1);
  if (resolvedWeights.length !== values.length) {
    throw new RangeError('Weights and values must have the same length');
  }
  if (resolvedWeights.some((weight) => !Number.isFinite(weight))) {
    throw new RangeError('Weights must be finite numbers');
  }
  const weightTotal = resolvedWeights.reduce((sum, weight) => sum + weight, 0);
  if (weightTotal <= 0 || resolvedWeights.some((weight) => weight < 0)) {
    throw new RangeError('Weights must be non-negative and have a positive total');
  }
  return values.reduce((sum, value, index) => sum + value * resolvedWeights[index], 0) / weightTotal;
}

export function forecastDemand(
  weeklyConsumption: readonly number[],
  currentStock: number,
  smoothingAlpha = 0.35,
): DemandForecast {
  if (weeklyConsumption.some((value) => value < 0) || currentStock < 0) {
    throw new RangeError('Consumption and stock values cannot be negative');
  }
  if (smoothingAlpha <= 0 || smoothingAlpha > 1) {
    throw new RangeError('Smoothing alpha must be greater than zero and at most one');
  }
  const weights = weeklyConsumption.map((_, index) => index + 1);
  const weightedAverageWeekly = weightedAverage(weeklyConsumption, weights);
  const smoothedWeekly = weeklyConsumption.length === 0
    ? 0
    : weeklyConsumption.slice(1).reduce(
      (smoothed, value) => smoothingAlpha * value + (1 - smoothingAlpha) * smoothed,
      weeklyConsumption[0],
    );
  const dailyConsumption = (weightedAverageWeekly * 0.6 + smoothedWeekly * 0.4) / 7;
  return {
    weightedAverageWeekly,
    smoothedWeekly,
    dailyConsumption,
    daysOfSupply: dailyConsumption > 0 ? currentStock / dailyConsumption : Number.POSITIVE_INFINITY,
    projectedDemand30Days: dailyConsumption * 30,
  };
}

export function daysUntilExpiry(expiryDate: string, now = new Date()): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) throw new RangeError(`Invalid expiry date: ${expiryDate}`);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  const [year, month, day] = expiryDate.split('-').map(Number);
  if (Number.isNaN(expiry.getTime()) || expiry.getFullYear() !== year || expiry.getMonth() !== month - 1 || expiry.getDate() !== day) {
    throw new RangeError(`Invalid expiry date: ${expiryDate}`);
  }
  return Math.floor((expiry.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
}

export function hasSixMonthShelfLife(expiryDate: string, now = new Date()): boolean {
  daysUntilExpiry(expiryDate, now);
  const cutoff = new Date(now.getFullYear(), now.getMonth() + 6, now.getDate());
  if (cutoff.getDate() !== now.getDate()) cutoff.setDate(0);
  const expiry = new Date(`${expiryDate}T00:00:00`);
  return expiry >= cutoff;
}

export function findSafeTransferSuggestions(
  candidates: readonly TransferCandidate[],
  unitCosts: ReadonlyMap<string, number>,
  now = new Date(),
): TransferSuggestion[] {
  return candidates.flatMap((candidate) => {
    const daysToExpiry = daysUntilExpiry(candidate.batch.expiry_date, now);
    const donorSurplus = Math.max(0, candidate.donorQuantity - candidate.donorSafetyStock);
    const recipientNeed = Math.max(0, candidate.recipientSafetyStock - candidate.recipientQuantity);
    const consumeBeforeExpiry = Math.floor(
      Math.max(0, daysToExpiry - candidate.transitDays) * candidate.recipientDailyConsumption,
    );
    const quantity = Math.min(donorSurplus, recipientNeed, candidate.batch.quantity, consumeBeforeExpiry);
    if (quantity <= 0 || daysToExpiry <= candidate.transitDays) return [];

    const daysOfCover = candidate.recipientDailyConsumption > 0
      ? quantity / candidate.recipientDailyConsumption
      : 0;
    const urgency = recipientNeed / Math.max(1, candidate.recipientSafetyStock);
    const expiryPressure = 1 / Math.max(1, daysToExpiry - candidate.transitDays);
    const priorityScore = Math.round((urgency * 55 + Math.min(daysOfCover, 30) * 1.5 + expiryPressure * 250) * 100) / 100;
    const unitCost = unitCosts.get(candidate.medicineId) ?? candidate.batch.unit_cost;
    return [{
      candidate,
      quantity,
      daysToExpiry,
      priorityScore,
      estimatedSavings: Math.round(quantity * unitCost * 100) / 100,
    }];
  }).sort((left, right) => right.priorityScore - left.priorityScore);
}

export function checkForNetworkSurplus(
  medicineId: string,
  requestedQuantity: number,
  batches: readonly DrugBatch[],
  facilities: readonly Facility[],
  now = new Date(),
): BuyingConflict[] {
  if (!Number.isInteger(requestedQuantity) || requestedQuantity <= 0) {
    throw new RangeError('Requested quantity must be a positive integer');
  }
  const facilityById = new Map(facilities.map((facility) => [facility.id, facility]));
  return batches.flatMap((batch) => {
    if (batch.medicine_id !== medicineId || batch.quantity <= batch.safety_stock) return [];
    const daysToExpiry = daysUntilExpiry(batch.expiry_date, now);
    if (daysToExpiry <= 0 || daysToExpiry > 120) return [];
    const facility = facilityById.get(batch.facility_id);
    if (!facility || facility.facility_type === 'Supplier') return [];
    return [{
      facility,
      batch,
      availableQuantity: Math.min(batch.quantity - batch.safety_stock, requestedQuantity),
      daysToExpiry,
    }];
  });
}

export function createTransferOrder(candidate: TransferSuggestion, createdAt = new Date()): TransferOrder {
  const manifestId = `MC-${createdAt.toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  return {
    id: crypto.randomUUID(),
    manifest_id: manifestId,
    medicine_id: candidate.candidate.medicineId,
    source_facility_id: candidate.candidate.donor.id,
    destination_facility_id: candidate.candidate.recipient.id,
    batch_id: candidate.candidate.batch.id,
    quantity: candidate.quantity,
    status: 'Pending Approval',
    created_at: createdAt.toISOString(),
  };
}

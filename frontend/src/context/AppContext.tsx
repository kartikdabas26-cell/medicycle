import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type {
  Drug, DrugBatch, EmergencyRestockRequest, FacilityStock, MarketplaceCartLine, NetworkFacility, NetworkNotification,
  PatientOffer, PatientOrder, RefillSubscription, TransferOrder,
} from '../types';
import { createTransferOrder, findSafeTransferSuggestions, hasSixMonthShelfLife } from '../utils/algorithms';

const DAY = 86_400_000;
const dateAfter = (days: number) => new Date(Date.now() + days * DAY).toISOString().slice(0, 10);

export const seededFacilities: NetworkFacility[] = [
  { id: 'NET-H01', name: 'Central Civil Hospital', facility_type: 'Hospital', location: 'Central District', distance_km: 4.1, open_24_hours: true, licensed: true },
  { id: 'NET-H02', name: 'Metro Specialty', facility_type: 'Hospital', location: 'Metro District', distance_km: 8.7, open_24_hours: true, licensed: true },
  { id: 'NET-C01', name: 'Apollo Chemist', facility_type: 'Chemist', location: 'Central District', distance_km: 0.8, open_24_hours: true, licensed: true },
  { id: 'NET-C02', name: 'MedLife Pharmacy', facility_type: 'Chemist', location: 'East District', distance_km: 2.4, open_24_hours: false, licensed: true },
  { id: 'NET-C03', name: 'City Care Meds', facility_type: 'Chemist', location: 'West District', distance_km: 3.8, open_24_hours: false, licensed: true },
  { id: 'NET-S01', name: 'Apex Pharma Logistics', facility_type: 'Supplier', location: 'Central Distribution Hub', distance_km: 12, open_24_hours: true, licensed: true },
  { id: 'NET-S02', name: 'Zenith Drug Distributors', facility_type: 'Supplier', location: 'East Distribution Hub', distance_km: 16, open_24_hours: true, licensed: true },
];

export const seededDrugs: Drug[] = [
  { id: 'MED-001', name: 'Amoxicillin 500mg', generic_name: 'Amoxicillin', category: 'Antibiotics', strength: '500mg', dosage_form: 'Capsule', unit: 'capsules', unit_cost: 0.12, patient_price: 0.18, brand_name: 'Moxikind' },
  { id: 'MED-002', name: 'Azithromycin 250mg', generic_name: 'Azithromycin', category: 'Antibiotics', strength: '250mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.24, patient_price: 0.34, brand_name: 'Azee' },
  { id: 'MED-003', name: 'Ceftriaxone 1g IV', generic_name: 'Ceftriaxone', category: 'Antibiotics', strength: '1g', dosage_form: 'Injection', unit: 'vials', unit_cost: 3.8, patient_price: 5.2, brand_name: 'Monocef' },
  { id: 'MED-004', name: 'Metformin 500mg', generic_name: 'Metformin', category: 'Diabetes', strength: '500mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.08, patient_price: 0.12, brand_name: 'Glycomet' },
  { id: 'MED-005', name: 'Atorvastatin 20mg', generic_name: 'Atorvastatin', category: 'Chronic / Cardio', strength: '20mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.11, patient_price: 0.16, brand_name: 'Atorva' },
  { id: 'MED-006', name: 'Insulin Glargine 100 IU/ml', generic_name: 'Insulin glargine', category: 'Diabetes', strength: '100 IU/ml', dosage_form: 'Injection pen', unit: 'pens', unit_cost: 8.4, patient_price: 12.5, brand_name: 'Lantus' },
  { id: 'MED-007', name: 'Insulin Regular 100 IU/ml', generic_name: 'Human insulin', category: 'Emergency', strength: '100 IU/ml', dosage_form: 'Injection', unit: 'vials', unit_cost: 5.8, patient_price: 8.2, brand_name: 'Actrapid' },
  { id: 'MED-008', name: 'Pantoprazole 40mg', generic_name: 'Pantoprazole', category: 'Gastrointestinal', strength: '40mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.09, patient_price: 0.14, brand_name: 'Pan' },
  { id: 'MED-009', name: 'Paracetamol 650mg', generic_name: 'Paracetamol', category: 'Pain relief', strength: '650mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.06, patient_price: 0.09, brand_name: 'Dolo 650' },
  { id: 'MED-010', name: 'Salbutamol Inhaler 100mcg', generic_name: 'Salbutamol', category: 'Respiratory', strength: '100mcg', dosage_form: 'Inhaler', unit: 'inhalers', unit_cost: 2.3, patient_price: 3.5, brand_name: 'Asthalin' },
  { id: 'MED-011', name: 'Telmisartan 40mg', generic_name: 'Telmisartan', category: 'Chronic / Cardio', strength: '40mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.13, patient_price: 0.2, brand_name: 'Telma' },
  { id: 'MED-012', name: 'Levothyroxine 50mcg', generic_name: 'Levothyroxine', category: 'Thyroid', strength: '50mcg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.07, patient_price: 0.11, brand_name: 'Thyronorm' },
  { id: 'MED-013', name: 'Amlodipine 5mg', generic_name: 'Amlodipine', category: 'Chronic / Cardio', strength: '5mg', dosage_form: 'Tablet', unit: 'tablets', unit_cost: 0.05, patient_price: 0.08, brand_name: 'Amlong' },
  { id: 'MED-014', name: 'Epinephrine 1mg/ml', generic_name: 'Epinephrine', category: 'Emergency', strength: '1mg/ml', dosage_form: 'Injection', unit: 'ampoules', unit_cost: 1.8, patient_price: 2.8, brand_name: 'Adrenalin' },
  { id: 'MED-015', name: 'Hydroxyurea 500mg', generic_name: 'Hydroxycarbamide', category: 'Oncology', strength: '500mg', dosage_form: 'Capsule', unit: 'capsules', unit_cost: 0.31, patient_price: 0.48, brand_name: 'Hydrea' },
];

const initialBatches: DrugBatch[] = seededDrugs.flatMap((drug, drugIndex) =>
  seededFacilities.filter((facility) => facility.facility_type !== 'Supplier').map((facility, facilityIndex) => {
    const isPatientFacility = facility.facility_type === 'Chemist';
    const expiryDays = isPatientFacility ? 230 + ((drugIndex * 11 + facilityIndex * 7) % 190)
      : 24 + ((drugIndex * 23 + facilityIndex * 31) % 330);
    const quantity = 35 + ((drugIndex * 71 + facilityIndex * 43) % 310);
    return {
      id: `B-${drug.id}-${facility.id}`,
      medicine_id: drug.id,
      facility_id: facility.id,
      batch_number: `MC-${drugIndex + 1}${facilityIndex + 1}-${String(2026 + Math.floor(expiryDays / 365)).slice(-2)}`,
      quantity,
      safety_stock: Math.floor(quantity * 0.28),
      expiry_date: dateAfter(expiryDays),
      unit_cost: drug.unit_cost,
    };
  }),
);

const initialStock: FacilityStock[] = initialBatches.map((batch, index) => {
  const facilityIndex = index % 5;
  const daily = 2 + ((index * 7) % 17);
  return {
    facility_id: batch.facility_id,
    medicine_id: batch.medicine_id,
    batch_id: batch.id,
    quantity: batch.quantity,
    safety_stock: 60 + ((index * 19) % 120),
    daily_consumption: daily,
    weekly_consumption: Array.from({ length: 8 }, (_, week) => daily * 7 * (0.9 + ((week + facilityIndex) % 5) * 0.05)),
    transit_days: 1 + (facilityIndex % 4),
  };
});

interface AppContextValue {
  facilities: NetworkFacility[];
  drugs: Drug[];
  batches: DrugBatch[];
  stock: FacilityStock[];
  cart: MarketplaceCartLine[];
  subscriptions: RefillSubscription[];
  orders: PatientOrder[];
  transferOrders: TransferOrder[];
  sosRequests: EmergencyRestockRequest[];
  notifications: NetworkNotification[];
  assistMode: boolean;
  patientSearch: string;
  offers: PatientOffer[];
  transferSuggestions: ReturnType<typeof findSafeTransferSuggestions>;
  setAssistMode: (enabled: boolean) => void;
  setPatientSearch: (value: string) => void;
  addToCart: (medicineId: string, facilityId: string, fulfillment: MarketplaceCartLine['fulfillment'], option?: MarketplaceCartLine['option']) => void;
  setCartQuantity: (medicineId: string, facilityId: string, option: MarketplaceCartLine['option'], quantity: number) => void;
  removeFromCart: (medicineId: string, facilityId: string, option: MarketplaceCartLine['option']) => void;
  checkout: (fulfillment: MarketplaceCartLine['fulfillment']) => PatientOrder;
  createSubscription: (medicineId: string, frequency: RefillSubscription['frequency']) => void;
  requestSosRestock: (medicineId: string) => NetworkFacility[];
  addNotification: (notification: Omit<NetworkNotification, 'id' | 'created_at' | 'read'>) => void;
  createTransferRequest: (index: number) => TransferOrder;
  resetDemoState: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const readStored = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : fallback;
  } catch (error) {
    console.error(`Could not restore ${key} from local storage`, error);
    return fallback;
  }
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [referenceDate] = useState(() => new Date());
  const [batches, setBatches] = useState<DrugBatch[]>(() => readStored('medicycle-network-batches', initialBatches));
  const [cart, setCart] = useState<MarketplaceCartLine[]>(() => readStored('medicycle-patient-cart', []));
  const [subscriptions, setSubscriptions] = useState<RefillSubscription[]>(() => readStored('medicycle-refills', []));
  const [orders, setOrders] = useState<PatientOrder[]>([]);
  const [transferOrders, setTransferOrders] = useState<TransferOrder[]>([]);
  const [sosRequests, setSosRequests] = useState<EmergencyRestockRequest[]>([]);
  const [notifications, setNotifications] = useState<NetworkNotification[]>([]);
  const [assistMode, setAssistModeState] = useState(() => localStorage.getItem('medicycle-assist-mode') === 'true');
  const [patientSearch, setPatientSearch] = useState('');

  useEffect(() => localStorage.setItem('medicycle-network-batches', JSON.stringify(batches)), [batches]);
  useEffect(() => localStorage.setItem('medicycle-patient-cart', JSON.stringify(cart)), [cart]);
  useEffect(() => localStorage.setItem('medicycle-refills', JSON.stringify(subscriptions)), [subscriptions]);

  const addNotification = useCallback((notification: Omit<NetworkNotification, 'id' | 'created_at' | 'read'>) => {
    setNotifications((current) => [{
      ...notification, id: crypto.randomUUID(), created_at: new Date().toISOString(), read: false,
    }, ...current]);
  }, []);

  const offers = useMemo(() => {
    const today = referenceDate;
    return batches.flatMap((batch) => {
      const facility = seededFacilities.find((item) => item.id === batch.facility_id);
      const medicine = seededDrugs.find((item) => item.id === batch.medicine_id);
      if (!facility || facility.facility_type !== 'Chemist' || !facility.licensed || !medicine || batch.quantity <= 0) return [];
      const days = Math.floor((new Date(`${batch.expiry_date}T00:00:00`).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / DAY);
      if (!hasSixMonthShelfLife(batch.expiry_date, today)) return [];
      return [{
        medicine, facility, batch, days_to_expiry: days, generic_price: medicine.patient_price,
        brand_price: Math.round(medicine.patient_price * 1.38 * 100) / 100,
        available_quantity: batch.quantity,
      }];
    });
  }, [batches, referenceDate]);

  const transferSuggestions = useMemo(() => {
    const stockByKey = new Map(stockInitialKeyed(batches, initialStock).map((item) => [`${item.facility_id}:${item.medicine_id}`, item]));
    const candidates = batches.flatMap((batch) => {
      const batchStock = stockByKey.get(`${batch.facility_id}:${batch.medicine_id}`);
      if (!batchStock) return [];
      const donor = seededFacilities.find((item) => item.id === batch.facility_id);
      if (!donor || donor.facility_type === 'Supplier') return [];
      return seededFacilities.filter((facility) => facility.id !== donor.id && facility.facility_type !== 'Supplier').flatMap((recipient) => {
        const recipientStock = stockByKey.get(`${recipient.id}:${batch.medicine_id}`);
        if (!recipientStock) return [];
        return [{
          medicineId: batch.medicine_id, batch, donor, recipient,
          donorQuantity: batchStock.quantity, recipientQuantity: recipientStock.quantity,
          donorSafetyStock: batchStock.safety_stock, recipientSafetyStock: recipientStock.safety_stock,
          recipientDailyConsumption: recipientStock.daily_consumption, transitDays: recipientStock.transit_days,
        }];
      });
    });
    return findSafeTransferSuggestions(candidates, new Map(seededDrugs.map((drug) => [drug.id, drug.unit_cost])), referenceDate);
  }, [batches, referenceDate]);

  const setAssistMode = useCallback((enabled: boolean) => {
    setAssistModeState(enabled);
    localStorage.setItem('medicycle-assist-mode', String(enabled));
  }, []);

  const addToCart = useCallback((medicineId: string, facilityId: string, fulfillment: MarketplaceCartLine['fulfillment'], option: MarketplaceCartLine['option'] = 'Generic') => {
    const offer = offers.find((item) => item.medicine.id === medicineId && item.facility.id === facilityId);
    if (!offer) throw new Error('This licensed pharmacy has no expiry-safe stock available.');
    if (cart.some((line) => line.facility_id !== facilityId)) {
      throw new Error('Complete or clear your current basket before choosing a different pharmacy.');
    }
    const existing = cart.find((line) => line.medicine_id === medicineId && line.facility_id === facilityId && line.option === option);
    const totalAtFacility = cart.filter((line) => line.medicine_id === medicineId && line.facility_id === facilityId)
      .reduce((sum, line) => sum + line.quantity, 0);
    if (totalAtFacility >= offer.available_quantity) throw new Error('The selected pharmacy has insufficient stock.');
    const nextQuantity = (existing?.quantity ?? 0) + 1;
    setCart(existing
      ? cart.map((line) => line === existing ? { ...line, quantity: nextQuantity, fulfillment } : line)
      : [...cart, { medicine_id: medicineId, facility_id: facilityId, quantity: 1, fulfillment, option }]);
  }, [cart, offers]);

  const setCartQuantity = useCallback((medicineId: string, facilityId: string, option: MarketplaceCartLine['option'], quantity: number) => {
    const offer = offers.find((item) => item.medicine.id === medicineId && item.facility.id === facilityId);
    if (!offer) throw new Error('The selected pharmacy no longer has expiry-safe stock.');
    const otherOptionQuantity = cart.filter((line) => line.medicine_id === medicineId && line.facility_id === facilityId && line.option !== option)
      .reduce((sum, line) => sum + line.quantity, 0);
    const maximum = offer.available_quantity - otherOptionQuantity;
    if (maximum < 1) throw new Error('The selected pharmacy no longer has enough stock for this item.');
    const nextQuantity = Math.max(1, Math.min(Math.floor(quantity), maximum));
    setCart((current) => current.map((line) => line.medicine_id === medicineId && line.facility_id === facilityId && line.option === option
      ? { ...line, quantity: nextQuantity } : line));
  }, [cart, offers]);

  const removeFromCart = useCallback((medicineId: string, facilityId: string, option: MarketplaceCartLine['option']) => {
    setCart((current) => current.filter((line) => line.medicine_id !== medicineId || line.facility_id !== facilityId || line.option !== option));
  }, []);

  const checkout = useCallback((fulfillment: MarketplaceCartLine['fulfillment']) => {
    if (cart.length === 0) throw new Error('Add an in-stock medicine to your cart before checkout.');
    for (const line of cart) {
      const offer = offers.find((item) => item.medicine.id === line.medicine_id && item.facility.id === line.facility_id);
      const sameOfferQuantity = cart.filter((item) => item.medicine_id === line.medicine_id && item.facility_id === line.facility_id)
        .reduce((sum, item) => sum + item.quantity, 0);
      if (!offer || sameOfferQuantity > offer.available_quantity) {
        throw new Error('A pharmacy offer changed. Review availability and update your cart before checkout.');
      }
    }
    const lineItems = cart.map((line) => ({ ...line, fulfillment }));
    const quantityByOffer = new Map<string, number>();
    lineItems.forEach((line) => {
      const key = `${line.medicine_id}:${line.facility_id}`;
      quantityByOffer.set(key, (quantityByOffer.get(key) ?? 0) + line.quantity);
    });
    const total = lineItems.reduce((sum, line) => {
      const drug = seededDrugs.find((item) => item.id === line.medicine_id);
      const price = (drug?.patient_price ?? 0) * (line.option === 'Brand' ? 1.38 : 1);
      return sum + price * line.quantity;
    }, 0);
    setBatches((current) => current.map((batch) => {
      const quantity = quantityByOffer.get(`${batch.medicine_id}:${batch.facility_id}`);
      return quantity ? { ...batch, quantity: batch.quantity - quantity } : batch;
    }));
    const order: PatientOrder = {
      id: `RX-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`,
      items: lineItems, total, fulfillment, created_at: new Date().toISOString(),
      status: fulfillment === 'Pickup' ? 'Ready for pickup' : 'Confirmed',
    };
    setOrders((current) => [order, ...current]);
    setCart([]);
    addNotification({
      title: fulfillment === 'Pickup' ? 'Pickup counter locked' : 'Patient order confirmed',
      message: `${order.id} is confirmed. All supplied batches meet the 6-month expiry guarantee.`,
      severity: 'success',
    });
    return order;
  }, [addNotification, cart, offers]);

  const createSubscription = useCallback((medicineId: string, frequency: RefillSubscription['frequency']) => {
    if (!seededDrugs.some((drug) => drug.id === medicineId)) throw new Error('Choose a supported maintenance medicine.');
    const refill = {
      id: crypto.randomUUID(), medicine_id: medicineId, patient_name: 'My household',
      frequency, next_refill_date: dateAfter(frequency === 'Monthly' ? 30 : frequency === 'Every 2 months' ? 60 : 90),
      quantity: 30, active: true,
    } satisfies RefillSubscription;
    setSubscriptions((current) => [refill, ...current]);
    addNotification({ title: 'Refill reminder created', message: `Your ${frequency.toLowerCase()} reminder is set. Review every refill before payment.`, severity: 'success' });
  }, [addNotification]);

  const requestSosRestock = useCallback((medicineId: string) => {
    const availableFacilities = seededFacilities.filter((facility) => facility.open_24_hours && offers.some((offer) =>
      offer.medicine.id === medicineId && offer.facility.id === facility.id));
    const drug = seededDrugs.find((item) => item.id === medicineId);
    const request: EmergencyRestockRequest = {
      id: crypto.randomUUID(),
      medicine_id: medicineId,
      facility_ids: availableFacilities.map((facility) => facility.id),
      created_at: new Date().toISOString(),
      status: availableFacilities.length > 0 ? 'Requested' : 'No nearby stock',
    };
    setSosRequests((current) => [request, ...current]);
    addNotification({
      title: availableFacilities.length > 0 ? 'Emergency restock request sent' : 'No nearby 24/7 stock found',
      message: `${drug?.name ?? 'Medicine'} checked at ${availableFacilities.length} licensed 24/7 chemist${availableFacilities.length === 1 ? '' : 's'}.`,
      severity: availableFacilities.length > 0 ? 'critical' : 'warning',
    });
    return availableFacilities;
  }, [addNotification, offers]);

  const createTransferRequest = useCallback((index: number) => {
    const suggestion = transferSuggestions[index];
    if (!suggestion) throw new Error('The selected transfer match is no longer available.');
    const order = createTransferOrder(suggestion);
    setTransferOrders((current) => [order, ...current]);
    addNotification({
      title: 'Transfer approval requested',
      message: `${suggestion.quantity} units requested from ${suggestion.candidate.donor.name} to ${suggestion.candidate.recipient.name}.`,
      severity: 'info',
    });
    return order;
  }, [addNotification, transferSuggestions]);

  const resetDemoState = useCallback(() => {
    setBatches(initialBatches);
    setCart([]);
    setSubscriptions([]);
    setOrders([]);
    setTransferOrders([]);
    setSosRequests([]);
    setNotifications([]);
    setAssistModeState(false);
    setPatientSearch('');
    localStorage.removeItem('medicycle-network-batches');
    localStorage.removeItem('medicycle-patient-cart');
    localStorage.removeItem('medicycle-refills');
    localStorage.removeItem('medicycle-assist-mode');
  }, []);

  const value: AppContextValue = {
    facilities: seededFacilities, drugs: seededDrugs, batches, stock: reconcileStock(batches, initialStock),
    cart, subscriptions, orders, transferOrders, sosRequests, notifications, assistMode, patientSearch, offers, transferSuggestions,
    setAssistMode, setPatientSearch, addToCart, setCartQuantity, removeFromCart, checkout,
    createSubscription, requestSosRestock, addNotification, createTransferRequest, resetDemoState,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

const reconcileStock = (batches: readonly DrugBatch[], baseline: readonly FacilityStock[]) =>
  baseline.map((stock) => ({ ...stock, quantity: batches.find((batch) => batch.id === stock.batch_id)?.quantity ?? stock.quantity }));

const stockInitialKeyed = (batches: readonly DrugBatch[], baseline: readonly FacilityStock[]) =>
  reconcileStock(batches, baseline);

export function useAppContext(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useAppContext must be used within AppProvider');
  return context;
}

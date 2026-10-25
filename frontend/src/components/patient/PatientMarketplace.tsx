import confetti from 'canvas-confetti';
import {
  ArrowRight, CalendarDays, CheckCircle2, Clock3, HeartPulse, Minus, PackageCheck,
  Plus, Search, ShieldCheck, ShoppingBag, ShoppingCart, Trash2, Truck, X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';
import type { MarketplaceCartLine, RefillSubscription } from '../../types';
import { AssistModeToggle } from './AssistModeToggle';
import { PrescriptionScanner } from './PrescriptionScanner';
import { SOSModal } from './SOSModal';
import { VoiceSearchBar } from './VoiceSearchBar';

type PatientSection = 'market' | 'refills' | 'orders';
type Fulfillment = MarketplaceCartLine['fulfillment'];

const money = (value: number) => `$${value.toFixed(2)}`;
const displayDate = (date: string) => new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00`));

export function PatientMarketplace() {
  const {
    assistMode, facilities, drugs, offers, patientSearch, setPatientSearch, cart, orders, subscriptions,
    addToCart, setCartQuantity, removeFromCart, checkout, createSubscription, notifications,
  } = useAppContext();
  const [section, setSection] = useState<PatientSection>('market');
  const [category, setCategory] = useState('All medicines');
  const [matchedIds, setMatchedIds] = useState<string[]>([]);
  const [showSos, setShowSos] = useState(false);
  const [showCheckout, setShowCheckout] = useState(false);
  const [fulfillment, setFulfillment] = useState<Fulfillment>('Delivery');
  const [subscribeMedicine, setSubscribeMedicine] = useState(() => drugs.find((drug) => ['Diabetes', 'Chronic / Cardio', 'Thyroid'].includes(drug.category))?.id ?? drugs[0].id);
  const [subscribeFrequency, setSubscribeFrequency] = useState<RefillSubscription['frequency']>('Monthly');
  const [message, setMessage] = useState('');

  const categories = useMemo(() => ['All medicines', ...new Set(drugs.map((drug) => drug.category))], [drugs]);
  const filteredOffers = useMemo(() => offers.filter((offer) => {
    const query = patientSearch.trim().toLowerCase();
    const searchable = `${offer.medicine.name} ${offer.medicine.generic_name} ${offer.medicine.brand_name} ${offer.facility.name} ${offer.facility.location}`.toLowerCase();
    return (!query || searchable.includes(query))
      && (category === 'All medicines' || offer.medicine.category === category)
      && (matchedIds.length === 0 || matchedIds.includes(offer.medicine.id));
  }).sort((a, b) => a.facility.distance_km - b.facility.distance_km || a.generic_price - b.generic_price), [category, matchedIds, offers, patientSearch]);

  const cartTotal = cart.reduce((sum, line) => {
    const drug = drugs.find((item) => item.id === line.medicine_id);
    return sum + (drug?.patient_price ?? 0) * (line.option === 'Brand' ? 1.38 : 1) * line.quantity;
  }, 0);

  const addMedicine = (medicineId: string, facilityId: string, option: MarketplaceCartLine['option']) => {
    try {
      setMessage('');
      addToCart(medicineId, facilityId, fulfillment, option);
      setMessage(`${drugs.find((drug) => drug.id === medicineId)?.name ?? 'Medicine'} added to your cart.`);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not add this medicine to your cart.');
    }
  };

  const createRefill = () => {
    try {
      createSubscription(subscribeMedicine, subscribeFrequency);
      setMessage('Refill reminder added to your delivery calendar.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Could not create a refill reminder.');
    }
  };

  const completeCheckout = () => {
    try {
      const order = checkout(fulfillment);
      setShowCheckout(false);
      setSection('orders');
      setMessage(`${order.id} confirmed. Review your order status below.`);
      void confetti({ particleCount: 65, spread: 55, origin: { y: 0.72 }, colors: ['#0EA5E9', '#10B981', '#0F2043'] });
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'Checkout could not be completed.');
    }
  };

  return (
    <div className={`v3-patient-page${assistMode ? ' assist-mode' : ''}`}>
      <section className="v3-patient-hero">
        <div className="v3-patient-hero-content">
          <div className="v3-eyebrow"><span className="v3-live-indicator" /> PATIENT DIRECT · LICENSED LOCAL PHARMACIES</div>
          <h1>Medicines, closer to home.</h1>
          <p>Compare trusted nearby stock, choose generic or brand, and get your prescription filled with confidence.</p>
          <VoiceSearchBar />
          <div className="v3-hero-points">
            <span><ShieldCheck size={16} /> Every listing has 6+ months shelf life</span>
            <span><MapPinIcon /> Local pickup or doorstep delivery</span>
          </div>
        </div>
        <div className="v3-patient-hero-art" aria-hidden="true">
          <div className="v3-hero-ring ring-one" /><div className="v3-hero-ring ring-two" />
          <span className="v3-hero-pill">✚</span><span className="v3-hero-spark">✦</span>
          <div className="v3-hero-stat"><span><CheckCircle2 size={16} /></span><b>Expiry-safe stock</b><small>Verified for every order</small></div>
        </div>
      </section>

      <div className="v3-patient-toolbar">
        <nav className="v3-patient-tabs" aria-label="Patient portal">
          <button type="button" className={section === 'market' ? 'active' : ''} onClick={() => setSection('market')}><ShoppingBag size={17} /> Find medicines</button>
          <button type="button" className={section === 'refills' ? 'active' : ''} onClick={() => setSection('refills')}><CalendarDays size={17} /> My refills <span>{subscriptions.length}</span></button>
          <button type="button" className={section === 'orders' ? 'active' : ''} onClick={() => setSection('orders')}><PackageCheck size={17} /> My orders <span>{orders.length}</span></button>
        </nav>
        <AssistModeToggle />
      </div>

      {message && <div className="v3-market-message" role="status"><CheckCircle2 size={17} />{message}<button type="button" onClick={() => setMessage('')} aria-label="Dismiss message"><X size={16} /></button></div>}

      {section === 'market' && <>
        <PrescriptionScanner onMatch={(ids) => { setMatchedIds(ids); if (ids.length > 0) setCategory('All medicines'); }} />
        <div className="v3-section-heading">
          <div><span className="v3-eyebrow">LOCAL STOCK FINDER</span><h2>Available near you</h2><p>{filteredOffers.length} licensed pharmacy offers · sorted by distance</p></div>
          <label className="v3-filter-select"><span>Category</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        </div>
        {filteredOffers.length > 0 ? <div className="v3-market-layout">
          <section className="v3-offer-list" aria-label="Nearby medicine offers">
            {filteredOffers.map((offer) => <article className="v3-patient-offer" key={offer.batch.id}>
              <div className="v3-offer-medicine">
                <span className="v3-medicine-symbol"><PillIcon /></span>
                <div><span className="v3-offer-category">{offer.medicine.category} · {offer.medicine.dosage_form}</span>
                  <h3>{offer.medicine.name}</h3><p>{offer.medicine.generic_name} · Batch {offer.batch.batch_number}</p></div>
                <span className="v3-expiry-safe"><ShieldCheck size={14} /> 6+ month guarantee</span>
              </div>
              <div className="v3-offer-meta">
                <span><MapPinIcon /><b>{offer.facility.name}</b><small>{offer.facility.distance_km.toFixed(1)} km · {offer.facility.location}</small></span>
                <span><Clock3 size={15} /><b>{offer.facility.open_24_hours ? 'Open 24/7' : 'Open today'}</b><small>{offer.available_quantity} {offer.medicine.unit} in stock</small></span>
                <span className="v3-expiry-date">Expires {displayDate(offer.batch.expiry_date)}<small>{offer.days_to_expiry} days remaining</small></span>
              </div>
              <div className="v3-price-compare">
                <div><span>GENERIC · BEST VALUE</span><strong>{money(offer.generic_price)}<small> / unit</small></strong><button type="button" onClick={() => addMedicine(offer.medicine.id, offer.facility.id, 'Generic')}>Add generic <Plus size={15} /></button></div>
                <div><span>BRANDED · {offer.medicine.brand_name.toUpperCase()}</span><strong>{money(offer.brand_price)}<small> / unit</small></strong><button type="button" onClick={() => addMedicine(offer.medicine.id, offer.facility.id, 'Brand')}>Add brand <Plus size={15} /></button></div>
              </div>
            </article>)}
          </section>
          <CartPanel
            lines={cart}
            onQuantity={(line, quantity) => setCartQuantity(line.medicine_id, line.facility_id, line.option, quantity)}
            onRemove={(line) => removeFromCart(line.medicine_id, line.facility_id, line.option)}
            total={cartTotal}
            fulfillment={fulfillment}
            onFulfillment={setFulfillment}
            onCheckout={() => setShowCheckout(true)}
          />
        </div> : <div className="v3-empty-offers"><Search size={24} /><strong>No matching expiry-safe stock nearby</strong><p>Try a different search or category. We never show patient offers with less than six months until expiry.</p><button type="button" onClick={() => { setPatientSearch(''); setCategory('All medicines'); setMatchedIds([]); }}>Clear filters</button></div>}
        <section className="v3-sos-banner"><span className="v3-sos-icon"><HeartPulse size={21} /></span><span><b>Need a critical medicine quickly?</b><small>Check 24/7 licensed pharmacy stock nearby for insulin, inhalers and emergency medicines.</small></span><button type="button" onClick={() => setShowSos(true)}>Emergency restock <ArrowRight size={16} /></button></section>
        <RefillSetup medicineId={subscribeMedicine} frequency={subscribeFrequency} onMedicine={setSubscribeMedicine} onFrequency={setSubscribeFrequency} onCreate={createRefill} drugs={drugs} />
      </>}

      {section === 'refills' && <section className="v3-content-panel">
        <div className="v3-section-heading"><div><span className="v3-eyebrow">CHRONIC CARE SUPPORT</span><h2>Your refill calendar</h2><p>Set reminders for maintenance medicines and review each refill before ordering.</p></div></div>
        <RefillSetup medicineId={subscribeMedicine} frequency={subscribeFrequency} onMedicine={setSubscribeMedicine} onFrequency={setSubscribeFrequency} onCreate={createRefill} drugs={drugs} />
        <div className="v3-refill-list">{subscriptions.length === 0 ? <EmptyMessage title="No reminders yet" text="Set a monthly or quarterly reminder for your regular medicines." /> : subscriptions.map((subscription) => {
          const drug = drugs.find((item) => item.id === subscription.medicine_id);
          return <article key={subscription.id}><span className="v3-icon-tile"><CalendarDays size={19} /></span><span><strong>{drug?.name ?? 'Medicine'}</strong><small>{subscription.frequency} · {subscription.quantity} units · Reminder on {displayDate(subscription.next_refill_date)}</small></span><b className="v3-sub-active">Active</b></article>;
        })}</div>
      </section>}

      {section === 'orders' && <section className="v3-content-panel">
        <div className="v3-section-heading"><div><span className="v3-eyebrow">ORDER TRACKING</span><h2>Your medicine orders</h2><p>Every order is sourced from a licensed nearby pharmacy and a fresh batch.</p></div></div>
        {orders.length === 0 ? <EmptyMessage title="No orders placed" text="Choose a nearby chemist offer and add a medicine to get started." /> : <div className="v3-order-list">{orders.map((order) => <article key={order.id}>
          <span className="v3-order-status"><PackageCheck size={19} /></span><div><strong>{order.id}</strong><small>{order.items.length} line item{order.items.length === 1 ? '' : 's'} · {displayDate(order.created_at.slice(0, 10))}</small><small>{order.items.map((line) => `${drugs.find((drug) => drug.id === line.medicine_id)?.name} × ${line.quantity}`).join(' · ')}</small></div><span className="v3-order-fulfillment">{order.fulfillment === 'Pickup' ? <><ShoppingBag size={14} /> {order.status}</> : <><Truck size={14} /> {order.status}</>}</span><b>{money(order.total)}</b>
        </article>)}</div>}
      </section>}

      {showSos && <SOSModal onClose={() => setShowSos(false)} />}
      {showCheckout && <CheckoutModal
        total={cartTotal} fulfillment={fulfillment} onFulfillment={setFulfillment}
        onClose={() => setShowCheckout(false)} onConfirm={completeCheckout}
        pharmacies={facilities.filter((facility) => facility.facility_type === 'Chemist')}
        cartLines={cart}
      />}

      {notifications.length > 0 && <div className="v3-patient-notice" role="status"><CheckCircle2 size={15} /> {notifications[0].title}</div>}
    </div>
  );
}

function CartPanel({ lines, onQuantity, onRemove, total, fulfillment, onFulfillment, onCheckout }: {
  lines: MarketplaceCartLine[]; onQuantity: (line: MarketplaceCartLine, quantity: number) => void;
  onRemove: (line: MarketplaceCartLine) => void; total: number; fulfillment: Fulfillment;
  onFulfillment: (value: Fulfillment) => void; onCheckout: () => void;
}) {
  const { drugs, facilities } = useAppContext();
  return <aside className="v3-cart-panel">
    <div className="v3-cart-heading"><span><ShoppingCart size={19} /></span><div><strong>Your basket</strong><small>{lines.reduce((sum, line) => sum + line.quantity, 0)} items</small></div></div>
    {lines.length === 0 ? <div className="v3-cart-empty"><ShoppingBag size={22} /><b>Your basket is empty</b><small>Add a nearby pharmacy offer to begin.</small></div> : <>
      <div className="v3-cart-lines">{lines.map((line) => {
        const drug = drugs.find((item) => item.id === line.medicine_id);
        const pharmacy = facilities.find((item) => item.id === line.facility_id);
        const price = (drug?.patient_price ?? 0) * (line.option === 'Brand' ? 1.38 : 1);
        return <article key={`${line.medicine_id}-${line.facility_id}-${line.option}`}>
          <span><strong>{drug?.name}</strong><small>{line.option} · {pharmacy?.name}</small><small>{money(price)} each</small></span>
          <span className="v3-cart-quantity"><button type="button" aria-label={`Decrease ${drug?.name} quantity`} disabled={line.quantity <= 1} onClick={() => onQuantity(line, line.quantity - 1)}><Minus size={13} /></button><b>{line.quantity}</b><button type="button" aria-label={`Increase ${drug?.name} quantity`} onClick={() => onQuantity(line, line.quantity + 1)}><Plus size={13} /></button><button type="button" aria-label={`Remove ${drug?.name}`} className="v3-remove-line" onClick={() => onRemove(line)}><Trash2 size={14} /></button></span>
        </article>;
      })}</div>
      <div className="v3-fulfillment-options"><span>Fulfilment</span><button type="button" className={fulfillment === 'Delivery' ? 'selected' : ''} onClick={() => onFulfillment('Delivery')}><Truck size={14} /> Delivery</button><button type="button" className={fulfillment === 'Pickup' ? 'selected' : ''} onClick={() => onFulfillment('Pickup')}><Clock3 size={14} /> 15-min pickup</button></div>
      <div className="v3-cart-total"><span>Estimated total</span><b>{money(total)}</b></div>
      <button type="button" className="v3-button-primary v3-wide-button" onClick={onCheckout}>Review checkout <ArrowRight size={16} /></button>
      <small className="v3-checkout-footnote"><ShieldCheck size={13} /> Fresh stock · Licensed pharmacy · No surprise fees</small>
    </>}
  </aside>;
}

function RefillSetup({ medicineId, frequency, onMedicine, onFrequency, onCreate, drugs }: {
  medicineId: string; frequency: RefillSubscription['frequency']; onMedicine: (value: string) => void;
  onFrequency: (value: RefillSubscription['frequency']) => void; onCreate: () => void;
  drugs: ReturnType<typeof useAppContext>['drugs'];
}) {
  const refillDrugs = drugs.filter((drug) => ['Diabetes', 'Chronic / Cardio', 'Thyroid'].includes(drug.category));
  return <section className="v3-refill-setup">
    <span className="v3-icon-tile"><CalendarDays size={19} /></span>
    <div className="v3-refill-setup-copy"><span className="v3-eyebrow">NEVER MISS A REFILL</span><strong>Plan your maintenance medicines</strong><small>We’ll add a reminder to your calendar. You confirm each order; nothing ships automatically.</small></div>
    <label>Medicine<select value={medicineId} onChange={(event) => onMedicine(event.target.value)}>{refillDrugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.name}</option>)}</select></label>
    <label>Frequency<select value={frequency} onChange={(event) => onFrequency(event.target.value as RefillSubscription['frequency'])}><option>Monthly</option><option>Every 2 months</option><option>Quarterly</option></select></label>
    <button type="button" className="v3-button-primary" onClick={onCreate}>Add reminder</button>
  </section>;
}

function CheckoutModal({ total, fulfillment, onFulfillment, onClose, onConfirm, pharmacies, cartLines }: {
  total: number; fulfillment: Fulfillment; onFulfillment: (value: Fulfillment) => void;
  onClose: () => void; onConfirm: () => void;
  pharmacies: ReturnType<typeof useAppContext>['facilities']; cartLines: MarketplaceCartLine[];
}) {
  const selectedPharmacy = pharmacies.find((facility) => cartLines.some((line) => line.facility_id === facility.id));
  return <div className="v3-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="v3-modal v3-checkout-modal" role="dialog" aria-modal="true" aria-labelledby="checkout-title">
      <button type="button" className="v3-modal-close" onClick={onClose} aria-label="Close checkout"><X /></button>
      <span className="v3-modal-symbol"><ShoppingBag size={23} /></span><span className="v3-eyebrow">SECURE CHECKOUT</span>
      <h2 id="checkout-title">Choose how to receive your order</h2>
      <p>Your medicines will be fulfilled by {selectedPharmacy?.name ?? 'a participating licensed pharmacy'}.</p>
      <div className="v3-checkout-choices">
        <button type="button" className={fulfillment === 'Delivery' ? 'selected' : ''} onClick={() => onFulfillment('Delivery')}><Truck size={20} /><span><b>Doorstep delivery</b><small>Local delivery estimate shown by pharmacy</small></span><i /></button>
        <button type="button" className={fulfillment === 'Pickup' ? 'selected' : ''} onClick={() => onFulfillment('Pickup')}><Clock3 size={20} /><span><b>Express counter pickup</b><small>Reserve a pickup counter for ~15 minutes</small></span><i /></button>
      </div>
      <div className="v3-checkout-total"><span>Estimated medicine total</span><b>{money(total)}</b></div>
      <div className="v3-checkout-safety"><ShieldCheck size={16} /> Every patient delivery is checked for a minimum 6-month shelf life.</div>
      <button type="button" className="v3-button-primary v3-wide-button" onClick={onConfirm}>Confirm demo order <ArrowRight size={16} /></button>
    </section>
  </div>;
}

function EmptyMessage({ title, text }: { title: string; text: string }) {
  return <div className="v3-empty-offers"><CalendarDays size={24} /><strong>{title}</strong><p>{text}</p></div>;
}

function MapPinIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 10c0 5-8 12-8 12S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></svg>;
}

function PillIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width="23" height="23" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m10.6 20.4 9.8-9.8a5.2 5.2 0 0 0-7.4-7.4l-9.8 9.8a5.2 5.2 0 0 0 7.4 7.4Z" /><path d="m8.2 8.2 7.6 7.6" /></svg>;
}

import { AlertTriangle, Clock3, MapPin, PhoneCall, ShieldAlert, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

export function SOSModal({ onClose }: { onClose: () => void }) {
  const { drugs, offers, requestSosRestock } = useAppContext();
  const [medicineId, setMedicineId] = useState(() => drugs.find((drug) => drug.generic_name === 'Insulin glargine')?.id ?? drugs[0].id);
  const [facilities, setFacilities] = useState<ReturnType<typeof requestSosRestock> | null>(null);
  const [error, setError] = useState('');
  const criticalDrugs = useMemo(() => drugs.filter((drug) => ['Emergency', 'Respiratory', 'Diabetes'].includes(drug.category)), [drugs]);
  const checkAvailability = () => {
    try {
      setError('');
      setFacilities(requestSosRestock(medicineId));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not check availability.');
    }
  };

  return (
    <div className="v3-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="v3-modal v3-sos-modal" role="dialog" aria-modal="true" aria-labelledby="sos-title">
        <button type="button" className="v3-modal-close" onClick={onClose} aria-label="Close emergency restock"><X /></button>
        <span className="v3-modal-symbol sos"><ShieldAlert size={24} /></span>
        <span className="v3-eyebrow">PRIORITY RESTOCK</span>
        <h2 id="sos-title">Find urgent medicine nearby</h2>
        <p>This checks live demo stock at licensed, expiry-safe chemists with 24/7 service.</p>
        <label className="v3-form-label">Medicine
          <select value={medicineId} onChange={(event) => { setMedicineId(event.target.value); setFacilities(null); }}>
            {criticalDrugs.map((drug) => <option key={drug.id} value={drug.id}>{drug.name}</option>)}
          </select>
        </label>
        {error && <p className="v3-error-text" role="alert">{error}</p>}
        <button type="button" className="v3-button-danger v3-wide-button" onClick={checkAvailability}>
          <AlertTriangle size={17} /> Check 24/7 availability
        </button>
        {facilities && <div className="v3-sos-results" aria-live="polite">
          {facilities.length === 0
            ? <p>No matching 24/7 stock is currently listed. Contact a clinician or local pharmacy for help.</p>
            : facilities.map((facility) => {
              const offer = offers.find((item) => item.facility.id === facility.id && item.medicine.id === medicineId);
              return <article key={facility.id}>
                <span className="v3-facility-marker"><MapPin size={17} /></span>
                <span><strong>{facility.name}</strong><small>{facility.distance_km.toFixed(1)} km · {facility.location} · <Clock3 size={12} /> Open 24/7</small></span>
                <b>{offer?.available_quantity ?? 0} available</b>
              </article>;
            })}
        </div>}
        <div className="v3-safety-note"><PhoneCall size={15} /> For a life-threatening emergency, contact local emergency services immediately.</div>
      </section>
    </div>
  );
}

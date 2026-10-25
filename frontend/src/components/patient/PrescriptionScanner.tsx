import { FileCheck2, FileUp, ScanLine } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

export function PrescriptionScanner({ onMatch }: { onMatch: (medicineIds: string[]) => void }) {
  const { drugs, offers } = useAppContext();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [status, setStatus] = useState('');
  const [matchedNames, setMatchedNames] = useState<string[]>([]);

  const scanFile = async (file?: File) => {
    if (!file) return;
    setStatus('');
    setMatchedNames([]);
    let readableText = file.name;
    if (file.type === 'text/plain' || file.type === 'text/csv') {
      try {
        readableText += ` ${await file.text()}`;
      } catch (error) {
        setStatus(error instanceof Error ? `Could not read prescription: ${error.message}` : 'Could not read this file.');
        return;
      }
    }
    const normalized = readableText.toLowerCase().replace(/[_-]/g, ' ');
    const matches = drugs.filter((drug) =>
      normalized.includes(drug.name.toLowerCase())
      || normalized.includes(drug.generic_name.toLowerCase())
      || normalized.includes(drug.brand_name.toLowerCase()),
    );
    const availableMatches = matches.filter((drug) => offers.some((offer) => offer.medicine.id === drug.id));
    const names = availableMatches.map((drug) => drug.name);
    setMatchedNames(names);
    onMatch(availableMatches.map((drug) => drug.id));
    setStatus(names.length > 0
      ? `Matched ${names.length} medicine${names.length === 1 ? '' : 's'} with expiry-safe nearby stock.`
      : 'Demo scanner could not identify a medicine. Try a text prescription or include a medicine name in the filename.');
  };

  return (
    <section
      className={`v3-prescription-drop${dragging ? ' is-dragging' : ''}`}
      onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); void scanFile(event.dataTransfer.files[0]); }}
      aria-label="Prescription upload and medicine matcher"
    >
      <span className="v3-icon-tile"><ScanLine size={20} /></span>
      <div className="v3-prescription-copy">
        <strong>Find the medicines on your prescription</strong>
        <span>Upload a text prescription or drop a file here. The demo matcher links recognized medicines to licensed, expiry-safe local stock.</span>
        {status && <span className="v3-scan-status" role="status"><FileCheck2 size={15} />{status}</span>}
        {matchedNames.length > 0 && <span className="v3-matched-tags">{matchedNames.map((name) => <b key={name}>{name}</b>)}</span>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*,.pdf,.txt,.csv"
        className="v3-visually-hidden"
        aria-label="Choose prescription file"
        onChange={(event) => { void scanFile(event.target.files?.[0]); event.target.value = ''; }}
      />
      <button type="button" className="v3-button-secondary" onClick={() => input.current?.click()}>
        <FileUp size={16} /> Upload prescription
      </button>
    </section>
  );
}

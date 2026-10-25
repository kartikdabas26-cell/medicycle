import { Mic, MicOff, Search } from 'lucide-react';
import { useRef, useState } from 'react';
import { useAppContext } from '../../context/AppContext';

interface SpeechResult {
  transcript: string;
}
interface SpeechEvent extends Event {
  results: ArrayLike<ArrayLike<SpeechResult>>;
}
interface SpeechRecognizer extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechEvent) => void) | null;
  onerror: ((event: Event) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
interface SpeechWindow extends Window {
  SpeechRecognition?: new () => SpeechRecognizer;
  webkitSpeechRecognition?: new () => SpeechRecognizer;
}

export function VoiceSearchBar() {
  const { patientSearch, setPatientSearch } = useAppContext();
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState('');
  const recognition = useRef<SpeechRecognizer | null>(null);

  const startListening = () => {
    const browserWindow = window as SpeechWindow;
    const SpeechRecognition = browserWindow.SpeechRecognition || browserWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessage('Voice search is not supported in this browser. Type a medicine name instead.');
      return;
    }
    setMessage('');
    const recognizer = new SpeechRecognition();
    recognition.current = recognizer;
    recognizer.lang = 'en-IN';
    recognizer.continuous = false;
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript;
      if (transcript) setPatientSearch(transcript.replace(/\bnear me\b/gi, '').trim());
    };
    recognizer.onerror = () => setMessage('We could not hear that. Please try again or type your search.');
    recognizer.onend = () => setListening(false);
    try {
      recognizer.start();
      setListening(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Voice search could not start.');
      setListening(false);
    }
  };

  return (
    <div className="v3-search-wrap">
      <label className="v3-search-field">
        <Search size={19} aria-hidden="true" />
        <input
          value={patientSearch}
          onChange={(event) => setPatientSearch(event.target.value)}
          placeholder="Search a medicine or molecule"
          aria-label="Search medicines near me"
        />
        <button type="button" onClick={startListening} aria-label={listening ? 'Voice search listening' : 'Search by voice'} className={listening ? 'is-listening' : ''}>
          {listening ? <MicOff size={19} /> : <Mic size={19} />}
        </button>
      </label>
      {message && <span className="v3-inline-message" role="status">{message}</span>}
      {listening && <span className="v3-inline-message" aria-live="polite">Listening—say a medicine name, such as “Metformin 500 near me”.</span>}
    </div>
  );
}

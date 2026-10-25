import { Accessibility, Check } from 'lucide-react';
import { useAppContext } from '../../context/AppContext';

export function AssistModeToggle() {
  const { assistMode, setAssistMode } = useAppContext();
  return (
    <button
      type="button"
      className={`v3-assist-toggle${assistMode ? ' is-active' : ''}`}
      aria-pressed={assistMode}
      onClick={() => setAssistMode(!assistMode)}
    >
      <Accessibility size={19} aria-hidden="true" />
      <span>{assistMode ? 'Assist mode on' : 'Assist mode'}</span>
      <span className="v3-toggle-mark">{assistMode && <Check size={13} />}</span>
    </button>
  );
}

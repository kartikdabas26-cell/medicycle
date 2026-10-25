import React, { useState } from 'react';
import { X, Sparkles, Send, Bot, ShieldCheck, User } from 'lucide-react';
import { api } from '../services/api';

interface AIAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AIAssistantModal: React.FC<AIAssistantModalProps> = ({ isOpen, onClose }) => {
  const [inputQuery, setInputQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'user' | 'assistant'; content: string; source?: string }>>([
    {
      role: 'assistant',
      content:
        'Greetings. I am the **MEDICYCLE Clinical Supply Copilot**. My recommendations are grounded strictly in your live hospital telemetry, batch shelf-life metrics, and inter-facility stock balances without extrapolation. How can I assist with your supply chain decisions today?',
      source: 'live-telemetry',
    },
  ]);

  const quickQuestions = [
    'Why is Amoxicillin being transferred from Apex to Valley?',
    'Which facilities have batches expiring soon?',
    'What critical shortages require immediate supplier reorders?',
  ];

  if (!isOpen) return null;

  const handleSend = async (queryToSend?: string) => {
    const q = (queryToSend || inputQuery).trim();
    if (!q || isLoading) return;

    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setInputQuery('');
    setIsLoading(true);

    try {
      const res = await api.askAI(q);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.response,
          source: res.source === 'gemini-api' ? 'Gemini 2.5 Flash' : 'Grounded Clinical Engine',
        },
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: 'Unable to retrieve clinical analysis at this moment. Please verify backend connection.',
          source: 'error',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
      <div className="glass-modal w-full max-w-2xl h-[620px] flex flex-col overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="p-4 px-6 border-b border-emerald-900/5 flex items-center justify-between bg-white/70">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 flex items-center justify-center text-white shadow-md shadow-emerald-500/25">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#0F172A] font-heading">
                  Clinical Supply Intelligence Copilot
                </h2>
                <span className="text-[10px] bg-emerald-100 text-emerald-800 border border-emerald-200 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-600" /> Grounded in Telemetry
                </span>
              </div>
              <p className="text-[11px] text-[#64748B]">
                Real-time mathematical and clinical justifications for stock balance
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="neu-button p-2 rounded-full text-[#64748B] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Chat History Viewport */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 text-xs">
          {messages.map((m, idx) => {
            const isUser = m.role === 'user';
            return (
              <div
                key={idx}
                className={`flex items-start gap-3 ${isUser ? 'flex-row-reverse' : ''}`}
              >
                <div
                  className={`h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
                    isUser
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'bg-white border border-emerald-200 text-emerald-700 shadow-xs'
                  }`}
                >
                  {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
                </div>

                <div
                  className={`max-w-[80%] p-4 rounded-2xl leading-relaxed space-y-1 ${
                    isUser
                      ? 'bg-emerald-600 text-white rounded-tr-xs shadow-md'
                      : 'glass-panel bg-white/90 text-[#0F172A] rounded-tl-xs shadow-sm border border-emerald-100'
                  }`}
                >
                  <p className="whitespace-pre-wrap">{m.content}</p>
                  {m.source && !isUser && (
                    <div className="text-[10px] text-emerald-700 font-semibold pt-1 border-t border-emerald-900/5">
                      Source: {m.source}
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isLoading && (
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-white border border-emerald-200 text-emerald-700 flex items-center justify-center">
                <Bot className="h-4 w-4" />
              </div>
              <div className="glass-panel p-3.5 rounded-2xl rounded-tl-xs text-xs text-emerald-800 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
                <span>Evaluating clinical supply algorithms...</span>
              </div>
            </div>
          )}
        </div>

        {/* Quick Question Chips */}
        <div className="px-6 py-2 border-t border-emerald-900/5 bg-white/50 flex items-center gap-2 overflow-x-auto text-xs">
          <span className="text-[11px] font-semibold text-[#64748B] flex-shrink-0">Suggestions:</span>
          {quickQuestions.map((q, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(q)}
              className="neu-button px-3 py-1 rounded-full text-[11px] font-medium text-emerald-900 hover:text-emerald-950 flex-shrink-0 whitespace-nowrap transition-all"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-4 px-6 border-t border-emerald-900/5 bg-white/80">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="flex items-center gap-3"
          >
            <input
              type="text"
              value={inputQuery}
              onChange={(e) => setInputQuery(e.target.value)}
              placeholder="Ask about inventory, transfer calculations, or expiry salvage..."
              className="flex-1 bg-[#F8FAF9] border border-emerald-100 rounded-full px-5 py-2.5 text-xs text-[#0F172A] placeholder-[#94A3B8] shadow-inner focus:outline-none focus:ring-2 focus:ring-emerald-500/40"
            />
            <button
              type="submit"
              disabled={!inputQuery.trim() || isLoading}
              className="neu-button-emerald px-5 py-2.5 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all disabled:opacity-50"
            >
              <span>Ask</span>
              <Send className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

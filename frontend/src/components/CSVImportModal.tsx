import React, { useState } from 'react';
import { X, UploadCloud, FileText, CheckCircle2, AlertCircle, Download } from 'lucide-react';
import { api } from '../services/api';

interface CSVImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
}

export const CSVImportModal: React.FC<CSVImportModalProps> = ({ isOpen, onClose, onImportComplete }) => {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);
  const [resultMsg, setResultMsg] = useState<{ type: 'success' | 'error'; text: string; details?: string[] } | null>(null);

  const handleDownloadTemplate = async () => {
    setIsDownloadingTemplate(true);
    try {
      await api.downloadFile(api.getInventoryTemplateUrl(), 'medicycle_inventory_template.csv');
    } catch (err: any) {
      setResultMsg({
        type: 'error',
        text: 'Failed to download template. Please check network connection.',
      });
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setResultMsg(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    setIsUploading(true);
    setResultMsg(null);

    try {
      const res = await api.importInventoryCSV(file);
      const details = res.errors && res.errors.length > 0 ? res.errors : undefined;
      setResultMsg({
        type: 'success',
        text: `Successfully synchronized ${res.updated_records ?? res.updated_count ?? 0} hospital inventory record(s)!`,
        details,
      });
      setTimeout(() => {
        onImportComplete();
        onClose();
      }, 1500);
    } catch (err: any) {
      setResultMsg({
        type: 'error',
        text: err.message || 'CSV Import failed. Please check file format and values.',
      });
    } finally {
      setIsUploading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
      <div className="glass-modal w-full max-w-lg p-6 space-y-4 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-emerald-900/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              📦
            </div>
            <h2 className="text-sm font-bold text-[#0F172A] font-heading">Import Medicine Inventory CSV</h2>
          </div>
          <button
            onClick={onClose}
            className="neu-button p-1.5 rounded-full text-[#64748B] hover:text-[#0F172A]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-[#64748B] leading-relaxed">
          Upload an updated hospital dispensary CSV to bulk-synchronize on-hand quantities, safety stock buffers, and supplier replenishment lead times.
        </p>

        {/* Required Columns & Template Download Card */}
        <div className="glass-panel p-3.5 bg-white/70 space-y-2 text-[11px] text-[#64748B]">
          <div className="flex items-center justify-between">
            <span className="font-bold text-[#0F172A]">Standard CSV Columns:</span>
            <button
              onClick={handleDownloadTemplate}
              disabled={isDownloadingTemplate}
              className="text-emerald-700 hover:text-emerald-900 font-bold inline-flex items-center gap-1 underline text-[11px]"
            >
              <Download className="h-3 w-3" />
              <span>{isDownloadingTemplate ? 'Downloading...' : 'Download Sample CSV'}</span>
            </button>
          </div>
          <code className="text-emerald-800 text-[10px] block font-mono bg-emerald-50/80 p-2 rounded-xl border border-emerald-200">
            Inventory_ID, Current_Stock, Safety_Stock, Lead_Time_Days, Expiry_Date
          </code>
        </div>

        {/* File Drag and Drop / Selector */}
        <div className="border-2 border-dashed border-emerald-200 hover:border-emerald-400 bg-emerald-50/30 rounded-2xl p-6 text-center cursor-pointer transition-all">
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            id="csv-file-input"
            className="hidden"
          />
          <label htmlFor="csv-file-input" className="cursor-pointer space-y-2 block">
            <FileText className="h-9 w-9 text-emerald-600 mx-auto" />
            <div className="text-xs font-bold text-[#0F172A]">
              {file ? file.name : 'Click to select CSV file'}
            </div>
            <div className="text-[10px] text-[#64748B]">
              {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Supports UTF-8 comma-separated files'}
            </div>
          </label>
        </div>

        {/* Results / Feedback Message */}
        {resultMsg && (
          <div
            className={`p-3.5 rounded-2xl border text-xs space-y-1.5 ${
              resultMsg.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : 'bg-rose-50 border-rose-200 text-rose-900'
            }`}
          >
            <div className="flex items-center gap-2 font-bold">
              {resultMsg.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              )}
              <span>{resultMsg.text}</span>
            </div>
            {resultMsg.details && resultMsg.details.length > 0 && (
              <ul className="list-disc pl-5 text-[11px] max-h-24 overflow-y-auto space-y-0.5">
                {resultMsg.details.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-3 border-t border-emerald-900/5">
          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="text-xs font-semibold text-emerald-800 hover:text-emerald-950"
          >
            Get Template
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="neu-button px-4 py-2 rounded-full text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
            >
              Cancel
            </button>
            <button
              onClick={handleUpload}
              disabled={!file || isUploading}
              className="neu-button-emerald px-5 py-2 rounded-full text-xs font-bold transition-all disabled:opacity-50"
            >
              {isUploading ? 'Synchronizing...' : 'Upload & Process'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

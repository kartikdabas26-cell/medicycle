import React, { useState } from 'react';
import {
  ArrowLeftRight,
  RefreshCw,
  Download,
  FileText,
  CheckCircle2,
  AlertCircle,
  Building2,
  ArrowRight,
  ShieldCheck,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  X,
  Check,
  Sparkles,
} from 'lucide-react';
import type { TransferRecommendation } from '../types';
import { RiskBadge } from '../components/RiskBadge';
import { api } from '../services/api';

interface TransferOptimizerPageProps {
  transfers: TransferRecommendation[];
  onRecalculate: () => void;
  onTransferExecuted: () => void;
  isRecalculating: boolean;
  surgePct: number;
}

export const TransferOptimizerPage: React.FC<TransferOptimizerPageProps> = ({
  transfers,
  onRecalculate,
  onTransferExecuted,
  isRecalculating,
  surgePct,
}) => {
  const [executingId, setExecutingId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ id: string; type: 'success' | 'error'; text: string } | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [pendingConfirmRec, setPendingConfirmRec] = useState<TransferRecommendation | null>(null);
  const [expandedRecs, setExpandedRecs] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedRecs((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenConfirm = (rec: TransferRecommendation) => {
    setPendingConfirmRec(rec);
  };

  const handleExecuteConfirmedTransfer = async () => {
    if (!pendingConfirmRec) return;
    const rec = pendingConfirmRec;
    setPendingConfirmRec(null);

    setExecutingId(rec.id);
    setFeedback(null);
    try {
      await api.approveTransfer(rec);
      setFeedback({
        id: rec.id,
        type: 'success',
        text: `Transfer approved. ${rec.suggested_quantity} units transferred from ${rec.source_facility_name} to ${rec.dest_facility_name}. Inventory updated.`,
      });
      setTimeout(() => {
        onTransferExecuted();
      }, 700);
    } catch (err: any) {
      setFeedback({
        id: rec.id,
        type: 'error',
        text: err.message || 'Failed to approve transfer',
      });
    } finally {
      setExecutingId(null);
    }
  };

  const [isExportingCsv, setIsExportingCsv] = useState(false);

  const handleExportCsv = async () => {
    if (isExportingCsv) return;
    setIsExportingCsv(true);
    setPdfError(null);
    try {
      await api.downloadFile(api.getTransfersExportUrl(surgePct), 'medicycle_transfers.csv');
    } catch (err: any) {
      setPdfError(err.message || 'Failed to export transfer CSV. Please check connection.');
    } finally {
      setIsExportingCsv(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExportingPdf(true);
    setPdfError(null);
    try {
      await api.downloadFile(
        api.getTransfersPdfUrl(surgePct),
        `medicycle_transfer_report_${new Date().toISOString().slice(0, 10)}.pdf`
      );
    } catch (err: any) {
      setPdfError(err.message || 'Failed to export PDF report. Please verify connection.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto animate-fade-in-up">
      {/* Top Header Card */}
      <div className="glass-panel p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              🔄
            </div>
            <h2 className="text-base font-bold text-[#0F172A] font-heading">
              Inter-Facility Transfer Optimization Engine
            </h2>
          </div>
          <p className="text-xs text-[#64748B] max-w-2xl leading-relaxed">
            Eliminates supplier wait times by redistributing surplus stock from regional donor hospitals to acute shortage sites, salvaging expiring batches with zero purchase expense.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={onRecalculate}
            disabled={isRecalculating}
            className="neu-button px-3.5 py-2 rounded-full text-xs font-semibold text-[#0F172A] hover:text-emerald-700 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 text-emerald-600 ${isRecalculating ? 'animate-spin' : ''}`} />
            <span>Recalculate</span>
          </button>

          <button
            onClick={handleExportCsv}
            disabled={isExportingCsv}
            className="neu-button px-3.5 py-2 rounded-full text-xs font-semibold text-[#0F172A] hover:text-emerald-700 flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <Download className={`h-3.5 w-3.5 text-emerald-600 ${isExportingCsv ? 'animate-bounce' : ''}`} />
            <span>{isExportingCsv ? 'Exporting...' : 'Export CSV'}</span>
          </button>

          <button
            onClick={handleExportPdf}
            disabled={isExportingPdf}
            className="neu-button-emerald px-4 py-2 rounded-full text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-50"
          >
            <FileText className={`h-3.5 w-3.5 ${isExportingPdf ? 'animate-spin' : ''}`} />
            <span>{isExportingPdf ? 'Generating PDF...' : 'Export Official PDF'}</span>
          </button>
        </div>
      </div>

      {pdfError && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 flex items-center justify-between">
          <span>{pdfError}</span>
          <button onClick={() => setPdfError(null)} className="underline hover:text-black font-semibold">
            Dismiss
          </button>
        </div>
      )}

      {/* Transfer Recommendation Cards Grid */}
      <div className="space-y-4">
        {transfers.map((rec) => {
          const isExpanded = !!expandedRecs[rec.id];
          const isBusy = executingId === rec.id;
          const isSuccess = feedback?.id === rec.id && feedback.type === 'success';

          return (
            <div
              key={rec.id}
              className="glass-panel p-6 border border-white hover:border-emerald-300 transition-all shadow-sm space-y-4"
            >
              {/* Card Header Row */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-emerald-900/5 pb-4">
                <div className="flex items-center gap-3">
                  <RiskBadge level={rec.urgency} />
                  <div>
                    <h3 className="text-sm font-bold text-[#0F172A] font-heading flex items-center gap-2">
                      <span>💊 {rec.medicine_name}</span>
                      <span className="text-[11px] font-normal text-[#64748B]">({rec.category || 'Essential'})</span>
                    </h3>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-xs text-[#64748B] font-medium">Recommended Transfer</div>
                    <div className="text-lg font-extrabold text-emerald-700 font-heading">
                      {rec.suggested_quantity} <span className="text-xs font-normal text-[#64748B]">{rec.unit || 'units'}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleOpenConfirm(rec)}
                    disabled={isBusy || isSuccess}
                    className={`neu-button-emerald px-4 py-2 rounded-full text-xs font-bold flex items-center gap-1.5 transition-all ${
                      isSuccess ? 'bg-emerald-700 opacity-90' : ''
                    }`}
                  >
                    <Check className="h-4 w-4" />
                    <span>{isBusy ? 'Executing...' : isSuccess ? 'Approved' : 'Approve Transfer'}</span>
                  </button>
                </div>
              </div>

              {/* Donor to Recipient Routing Visual */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Source Facility (Donor) */}
                <div className="p-4 rounded-2xl bg-white/70 border border-emerald-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                    <span className="flex items-center gap-1.5">
                      <span>🏥</span>
                      <span>Donor: {rec.source_facility_name}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      Surplus Hub
                    </span>
                  </div>
                  <div className="text-xs text-[#64748B] space-y-1">
                    <div className="flex justify-between">
                      <span>Remaining stock after transfer:</span>
                      <span className="font-mono font-bold text-[#0F172A]">{rec.source_stock_remaining} units</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Donor safety buffer retained:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {rec.donor_coverage_days_post_transfer} days
                      </span>
                    </div>
                  </div>
                </div>

                {/* Destination Facility (Recipient) */}
                <div className="p-4 rounded-2xl bg-white/70 border border-emerald-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-[#0F172A]">
                    <span className="flex items-center gap-1.5">
                      <span>🏥</span>
                      <span>Recipient: {rec.dest_facility_name}</span>
                    </span>
                    <span className="text-[10px] font-semibold text-rose-800 bg-rose-50 px-2 py-0.5 rounded-full border border-rose-200">
                      Deficit Site
                    </span>
                  </div>
                  <div className="text-xs text-[#64748B] space-y-1">
                    <div className="flex justify-between">
                      <span>Coverage before transfer:</span>
                      <span className="font-mono font-bold text-rose-600">{rec.dest_days_cover_before} days</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Projected coverage after arrival:</span>
                      <span className="font-mono font-bold text-emerald-700">
                        {rec.dest_days_cover_after} days
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Clinical Justification Narrative */}
              <div className="p-3.5 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-xs text-emerald-950 flex items-start gap-2.5">
                <Sparkles className="h-4 w-4 text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  <strong>Clinical Justification:</strong> {rec.reason}
                </p>
              </div>

              {/* Feedback Alert if Action Performed */}
              {feedback && feedback.id === rec.id && (
                <div
                  className={`p-3 rounded-2xl border text-xs flex items-center gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                      : 'bg-rose-100 text-rose-900 border-rose-300'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-rose-600 flex-shrink-0" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              {/* Expandable How This Was Calculated */}
              <div>
                <button
                  onClick={() => toggleExpand(rec.id)}
                  className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 flex items-center gap-1.5"
                >
                  <HelpCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>How this was calculated</span>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>

                {isExpanded && (
                  <div className="mt-3 p-4 rounded-2xl bg-white/80 border border-emerald-100 text-xs text-[#64748B] space-y-2 animate-fade-in-up">
                    <p className="font-semibold text-[#0F172A]">Algorithmic Verification Parameters:</p>
                    <ul className="list-disc pl-5 space-y-1 text-[11px]">
                      <li>
                        <strong>Donor Buffer Retention:</strong> After deducting {rec.suggested_quantity} units, donor retains {rec.donor_coverage_days_post_transfer} days of supply — surpassing its safety stock requirement.
                      </li>
                      <li>
                        <strong>Recipient Deficit Elimination:</strong> Recipient was operating at {rec.dest_days_cover_before}d coverage (below supplier lead time); post-transfer buffer reaches {rec.dest_days_cover_after}d.
                      </li>
                      <li>
                        <strong>Batch Expiry Priority:</strong> Batches with the earliest expiration date are matched first (FEFO: First Expired, First Out) to prevent shelf-life expiration waste.
                      </li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {transfers.length === 0 && (
          <div className="glass-panel p-12 text-center text-xs text-[#64748B] space-y-2">
            <span className="text-3xl">✅</span>
            <h3 className="text-base font-bold text-[#0F172A] font-heading">
              All Regional Inventories Balanced
            </h3>
            <p className="max-w-md mx-auto">
              No inter-facility stock transfers are required under the current demand profile. All dispensaries maintain sufficient buffer stock.
            </p>
          </div>
        )}
      </div>

      {/* Pre-Execution Confirmation Modal */}
      {pendingConfirmRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in-up">
          <div className="glass-modal w-full max-w-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-emerald-900/5 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔄</span>
                <h3 className="text-sm font-bold text-[#0F172A] font-heading">
                  Confirm Stock Transfer Authorization
                </h3>
              </div>
              <button
                onClick={() => setPendingConfirmRec(null)}
                className="neu-button p-1.5 rounded-full text-[#64748B] hover:text-[#0F172A]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-[#64748B]">
              <p>
                You are approving the physical inter-facility redistribution of:
              </p>
              <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 font-semibold text-[#0F172A]">
                {pendingConfirmRec.suggested_quantity} {pendingConfirmRec.unit} of {pendingConfirmRec.medicine_name}
              </div>
              <div className="space-y-1 text-[11px] bg-white/70 p-3 rounded-2xl border border-emerald-100">
                <div>From: <strong>{pendingConfirmRec.source_facility_name}</strong></div>
                <div>To: <strong>{pendingConfirmRec.dest_facility_name}</strong></div>
                <div>Recipient buffer improves from <strong>{pendingConfirmRec.dest_days_cover_before}d</strong> to <strong>{pendingConfirmRec.dest_days_cover_after}d</strong></div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-emerald-900/5">
              <button
                onClick={() => setPendingConfirmRec(null)}
                className="neu-button px-4 py-2 rounded-full text-xs font-semibold text-[#64748B] hover:text-[#0F172A]"
              >
                Cancel
              </button>
              <button
                onClick={handleExecuteConfirmedTransfer}
                className="neu-button-emerald px-5 py-2 rounded-full text-xs font-bold"
              >
                Confirm & Apply Transfer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState } from 'react';
import { AlertOctagon, X, Route } from 'lucide-react';

export default function BlockedRoadModal({ isOpen, onClose, onReport }) {
  const [name, setName] = useState('Moosarambagh Bridge Approach');
  const [reason, setReason] = useState('Severe Musi river overflow / waterlogging');
  const [startLat, setStartLat] = useState('17.3812');
  const [startLng, setStartLng] = useState('78.5179');
  const [endLat, setEndLat] = useState('17.3830');
  const [endLng, setEndLng] = useState('78.5200');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onReport({
        name: name.trim(),
        reason: reason.trim(),
        reported_by: "Control Room Watch Officer",
        geometry: {
          type: "LineString",
          coordinates: [
            [parseFloat(startLng), parseFloat(startLat)],
            [parseFloat(endLng), parseFloat(endLat)]
          ]
        }
      });
      onClose();
    } catch (err) {
      alert(`Failed to log road blockage: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0F172A]/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] w-full max-w-md p-6 text-[14px] shadow-md flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h3 className="font-semibold text-[#0F172A] text-[16px]">Report Road Blockage / Diversion</h3>
            <p className="text-[12px] text-[#64748B]">Updates live OSRM routing corridors dynamically</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-[4px] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[#475569]">Road / Corridor Name</label>
            <input
              type="text"
              required
              placeholder="e.g. Moosarambagh Bridge Approach"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="vp-input"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[#475569]">Reason for Inaccessibility</label>
            <input
              type="text"
              required
              placeholder="e.g. Severe Musi river overflow / waterlogging"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="vp-input"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[#E2E8F0]">
            <span className="text-[12px] font-medium text-[#475569] flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-[#4338CA]" strokeWidth={1.5} />
              Blockage Coordinates (Start & End)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#64748B]">Start Lat / Lng</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={startLat}
                    onChange={(e) => setStartLat(e.target.value)}
                    className="vp-input vp-mono text-[12px]"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={startLng}
                    onChange={(e) => setStartLng(e.target.value)}
                    className="vp-input vp-mono text-[12px]"
                  />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-[#64748B]">End Lat / Lng</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={endLat}
                    onChange={(e) => setEndLat(e.target.value)}
                    className="vp-input vp-mono text-[12px]"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={endLng}
                    onChange={(e) => setEndLng(e.target.value)}
                    className="vp-input vp-mono text-[12px]"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-2 pt-3 border-t border-[#E2E8F0]">
            <button
              type="button"
              onClick={onClose}
              className="vp-btn vp-btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="vp-btn vp-btn-primary"
            >
              {submitting ? 'Reporting…' : 'Report Blockage'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

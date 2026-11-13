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
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 text-xs shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <AlertOctagon className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Report Road Blockage / Diversion</h3>
              <p className="text-[11px] text-slate-400">Updates OSRM routing corridors dynamically</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="text-slate-700 font-bold text-xs">Road / Corridor Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
            />
          </div>

          <div>
            <label className="text-slate-700 font-bold text-xs">Reason for Inaccessibility</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
            />
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
            <span className="text-slate-700 font-bold text-xs flex items-center gap-1.5">
              <Route className="w-3.5 h-3.5 text-indigo-600" />
              Blockage Coordinates (Start & End)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 font-medium">Start Lat / Lng</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={startLat}
                    onChange={(e) => setStartLat(e.target.value)}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs outline-none focus:border-indigo-500"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={startLng}
                    onChange={(e) => setStartLng(e.target.value)}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-medium">End Lat / Lng</label>
                <div className="flex gap-1.5 mt-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={endLat}
                    onChange={(e) => setEndLat(e.target.value)}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs outline-none focus:border-indigo-500"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={endLng}
                    onChange={(e) => setEndLng(e.target.value)}
                    className="w-1/2 bg-white border border-slate-200 rounded-lg px-2 py-1 text-slate-900 font-mono text-xs outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="bg-slate-100 hover:bg-slate-200 text-slate-700 px-4 py-2 rounded-xl font-bold transition text-xs"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-extrabold transition disabled:opacity-50 shadow-sm text-xs"
            >
              {submitting ? 'Submitting...' : 'Register Road Diversion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

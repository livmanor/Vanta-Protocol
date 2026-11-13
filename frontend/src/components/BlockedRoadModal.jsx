import React, { useState } from 'react';
import { AlertOctagon, X } from 'lucide-react';

export default function BlockedRoadModal({ isOpen, onClose, onReport }) {
  const [name, setName] = useState('Velachery Main Road');
  const [reason, setReason] = useState('Severe waterlogging (>3 ft inundation)');
  const [startLat, setStartLat] = useState('12.980');
  const [startLng, setStartLng] = useState('80.220');
  const [endLat, setEndLat] = useState('12.985');
  const [endLng, setEndLng] = useState('80.225');
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
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111111] border border-gray-800 rounded-xl w-full max-w-md p-5 text-xs shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertOctagon className="w-4 h-4 text-neutral-400" />
            <h3 className="font-bold text-white text-sm">Report Road Blockage / Diversion</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-gray-400 font-medium">Road / Corridor Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-neutral-400"
            />
          </div>

          <div>
            <label className="text-gray-400 font-medium">Reason for Inaccessibility</label>
            <input
              type="text"
              required
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-neutral-400"
            />
          </div>

          <div className="bg-gray-900/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-2">
            <span className="text-gray-300 font-semibold">Blockage Coordinates (Start & End)</span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500">Start Lat / Lng</label>
                <div className="flex gap-1 mt-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={startLat}
                    onChange={(e) => setStartLat(e.target.value)}
                    className="w-1/2 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white font-mono text-xs"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={startLng}
                    onChange={(e) => setStartLng(e.target.value)}
                    className="w-1/2 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white font-mono text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="text-[10px] text-gray-500">End Lat / Lng</label>
                <div className="flex gap-1 mt-1">
                  <input
                    type="number"
                    step="0.0001"
                    value={endLat}
                    onChange={(e) => setEndLat(e.target.value)}
                    className="w-1/2 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white font-mono text-xs"
                  />
                  <input
                    type="number"
                    step="0.0001"
                    value={endLng}
                    onChange={(e) => setEndLng(e.target.value)}
                    className="w-1/2 bg-gray-950 border border-gray-800 rounded px-2 py-1 text-white font-mono text-xs"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 mt-2">
            <button
              type="button"
              onClick={onClose}
              className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-4 py-2 rounded font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-white text-black hover:bg-neutral-200 px-4 py-2 rounded font-semibold transition disabled:opacity-50"
            >
              {submitting ? 'Submitting...' : 'Register Road Diversion'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


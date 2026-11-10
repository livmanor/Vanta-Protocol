import React, { useState } from 'react';
import { AlertCircle, X, MapPin } from 'lucide-react';

export default function IncidentIntakeModal({ isOpen, onClose, onReport }) {
  const [type, setType] = useState('flood');
  const [urgency, setUrgency] = useState(3);
  const [people, setPeople] = useState(2);
  const [vulnerable, setVulnerable] = useState(false);
  const [message, setMessage] = useState('');
  const [lat, setLat] = useState('13.010');
  const [lng, setLng] = useState('80.240');
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!message.trim()) {
      alert("Please enter incident details.");
      return;
    }
    setSubmitting(true);
    try {
      await onReport({
        type,
        urgency: parseInt(urgency, 10),
        people: parseInt(people, 10) || 0,
        vulnerable,
        message: message.trim(),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        source: "Officer Control Room Form"
      });
      onClose();
    } catch (err) {
      alert(`Failed to log incident: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-gray-800 rounded-xl w-full max-w-md p-5 text-xs shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500" />
            <h3 className="font-bold text-white text-sm">Log Emergency Incident</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 font-medium">Incident Category</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-rose-500"
              >
                <option value="flood">Flood / Waterlogging</option>
                <option value="trapped">Trapped Citizens</option>
                <option value="medical">Medical Emergency</option>
                <option value="road_blocked">Road Blockage / Diversion</option>
                <option value="fire">Electrical / Fire Hazard</option>
              </select>
            </div>

            <div>
              <label className="text-gray-400 font-medium">Urgency Rating (1–5)</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-rose-500 font-bold"
              >
                <option value="5">5 - Immediate Life Threat</option>
                <option value="4">4 - High Urgency</option>
                <option value="3">3 - Moderate</option>
                <option value="2">2 - Low / Advisory</option>
                <option value="1">1 - Minimal</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-gray-400 font-medium">Description / Caller Message</label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Water ingress at ground floor, family stranded on rooftop"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-rose-500 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="text-gray-400 font-medium">People Affected</label>
              <input
                type="number"
                min="0"
                value={people}
                onChange={(e) => setPeople(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="vuln"
                checked={vulnerable}
                onChange={(e) => setVulnerable(e.target.checked)}
                className="w-4 h-4 rounded text-rose-600 bg-gray-900 border-gray-700 focus:ring-rose-500"
              />
              <label htmlFor="vuln" className="text-gray-300 font-medium cursor-pointer">
                Elderly / Infants Present
              </label>
            </div>
          </div>

          <div className="bg-gray-900/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-2">
            <span className="text-gray-300 font-semibold flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-rose-400" />
              Incident Coordinates
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white outline-none focus:border-rose-500 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white outline-none focus:border-rose-500 text-xs font-mono"
                />
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
              className="bg-rose-600 hover:bg-rose-500 text-white px-4 py-2 rounded font-semibold transition disabled:opacity-50"
            >
              {submitting ? 'Logging...' : 'Confirm Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

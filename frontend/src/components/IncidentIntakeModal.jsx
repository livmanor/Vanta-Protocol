import React, { useState } from 'react';
import { AlertCircle, X, MapPin } from 'lucide-react';

export default function IncidentIntakeModal({ isOpen, onClose, onReport }) {
  const [type, setType] = useState('flood');
  const [urgency, setUrgency] = useState(3);
  const [people, setPeople] = useState(2);
  const [vulnerable, setVulnerable] = useState(false);
  const [message, setMessage] = useState('');
  const [lat, setLat] = useState('17.3914');
  const [lng, setLng] = useState('78.4702');
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
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 text-xs shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <AlertCircle className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Log Emergency Incident</h3>
              <p className="text-[11px] text-slate-400">Hyderabad Metropolitan Police Intake</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 font-bold text-xs">Incident Category</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
              >
                <option value="flood">Flood / Waterlogging</option>
                <option value="trapped">Trapped Citizens</option>
                <option value="medical">Medical Emergency</option>
                <option value="road_blocked">Road Blockage / Diversion</option>
                <option value="fire">Electrical / Fire Hazard</option>
              </select>
            </div>

            <div>
              <label className="text-slate-700 font-bold text-xs">Urgency Rating (1–5)</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-bold"
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
            <label className="text-slate-700 font-bold text-xs">Description / Caller Message</label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Water ingress at underpass, vehicle stranded"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 resize-none font-medium text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div>
              <label className="text-slate-700 font-bold text-xs">People Affected</label>
              <input
                type="number"
                min="0"
                value={people}
                onChange={(e) => setPeople(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
              />
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                type="checkbox"
                id="vuln"
                checked={vulnerable}
                onChange={(e) => setVulnerable(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 accent-indigo-600 focus:ring-indigo-400"
              />
              <label htmlFor="vuln" className="text-slate-700 font-semibold cursor-pointer text-xs">
                Elderly / Infants Present
              </label>
            </div>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
            <span className="text-slate-700 font-bold text-xs flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-indigo-600" />
              Incident Coordinates (Hyderabad)
            </span>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-slate-400 font-medium">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 outline-none focus:border-indigo-500 text-xs font-mono"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-400 font-medium">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-900 outline-none focus:border-indigo-500 text-xs font-mono"
                />
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
              {submitting ? 'Logging...' : 'Confirm Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

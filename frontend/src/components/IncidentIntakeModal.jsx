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
    <div className="fixed inset-0 z-[1000] bg-[#0F172A]/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] w-full max-w-md p-6 text-[14px] shadow-md flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h3 className="font-semibold text-[#0F172A] text-[16px]">Log Emergency Incident</h3>
            <p className="text-[12px] text-[#64748B]">Hyderabad Police Intake Control</p>
          </div>
          <button
            onClick={onClose}
            className="text-[#64748B] hover:text-[#0F172A] p-1 rounded-[4px] hover:bg-[#F1F5F9] transition"
          >
            <X className="w-4 h-4" strokeWidth={1.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#475569]">Category</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="vp-input"
              >
                <option value="flood">Flood / Waterlogging</option>
                <option value="trapped">Trapped Citizens</option>
                <option value="medical">Medical Emergency</option>
                <option value="road_blocked">Road Blockage</option>
                <option value="fire">Electrical / Hazard</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#475569]">Urgency (1–5)</label>
              <select
                value={urgency}
                onChange={(e) => setUrgency(e.target.value)}
                className="vp-input font-medium"
              >
                <option value="5">5 - Immediate Threat</option>
                <option value="4">4 - High Urgency</option>
                <option value="3">3 - Moderate</option>
                <option value="2">2 - Low / Advisory</option>
                <option value="1">1 - Minimal</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[#475569]">Caller message / details</label>
            <textarea
              required
              rows={2}
              placeholder="e.g. Water ingress at underpass, vehicle stranded"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              className="w-full bg-white border border-[#E2E8F0] rounded-[6px] p-2.5 text-[14px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none focus:border-[#4338CA] focus:ring-2 focus:ring-[#4338CA]/15 resize-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3 items-center">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#475569]">People affected</label>
              <input
                type="number"
                min="0"
                value={people}
                onChange={(e) => setPeople(e.target.value)}
                className="vp-input"
              />
            </div>

            <div className="flex items-center gap-2 pt-4">
              <input
                type="checkbox"
                id="vuln"
                checked={vulnerable}
                onChange={(e) => setVulnerable(e.target.checked)}
                className="w-4 h-4 rounded-[4px] border-[#CBD5E1] text-[#4338CA] focus:ring-[#4338CA]"
              />
              <label htmlFor="vuln" className="text-[12px] text-[#334155] cursor-pointer">
                Elderly / infants present
              </label>
            </div>
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[#E2E8F0]">
            <span className="text-[12px] font-medium text-[#475569] flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-[#4338CA]" strokeWidth={1.5} />
              Coordinates (Hyderabad)
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-[#64748B]">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="vp-input vp-mono text-[12px]"
                />
              </div>
              <div>
                <label className="text-[11px] text-[#64748B]">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  className="vp-input vp-mono text-[12px]"
                />
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
              {submitting ? 'Logging…' : 'Confirm Incident'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

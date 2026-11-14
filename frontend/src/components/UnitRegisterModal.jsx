import React, { useState } from 'react';
import { Shield, X, MapPin, Navigation } from 'lucide-react';

export default function UnitRegisterModal({ isOpen, onClose, onRegister }) {
  const [unitId, setUnitId] = useState('');
  const [kind, setKind] = useState('patrol');
  const [station, setStation] = useState('Banjara Hills Police Station');
  const [lat, setLat] = useState('17.4115');
  const [lng, setLng] = useState('78.4353');
  const [capacity, setCapacity] = useState(4);
  const [gettingLocation, setGettingLocation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert("Browser Geolocation is not supported on this device.");
      return;
    }
    setGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(5));
        setLng(pos.coords.longitude.toFixed(5));
        setGettingLocation(false);
      },
      (err) => {
        alert(`Failed to retrieve live device location: ${err.message}`);
        setGettingLocation(false);
      },
      { timeout: 8000 }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await onRegister({
        id: unitId.trim() || undefined,
        kind,
        station: station.trim(),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        capacity: parseInt(capacity, 10) || 1
      });
      onClose();
    } catch (err) {
      alert(`Registration failed: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-[#0F172A]/30 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-[#E2E8F0] rounded-[6px] w-full max-w-md p-6 text-[14px] shadow-md flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-[#E2E8F0] pb-3">
          <div>
            <h3 className="font-semibold text-[#0F172A] text-[16px]">Register Emergency Unit</h3>
            <p className="text-[12px] text-[#64748B]">Hyderabad Patrol & Rescue Roster</p>
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
            <label className="text-[12px] font-medium text-[#475569]">Unit Identifier</label>
            <input
              type="text"
              placeholder="e.g. PATROL-104 (auto-generated if blank)"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="vp-input"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#475569]">Asset Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="vp-input"
              >
                <option value="patrol">Patrol Vehicle</option>
                <option value="rescue_boat">Rescue Boat (NDRF/SDRF)</option>
                <option value="ambulance">Emergency Ambulance</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[#475569]">Rescue Capacity</label>
              <input
                type="number"
                min="1"
                max="50"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="vp-input"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[12px] font-medium text-[#475569]">Base Station</label>
            <input
              type="text"
              required
              placeholder="e.g. Banjara Hills Police Station"
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="vp-input"
            />
          </div>

          <div className="flex flex-col gap-2 pt-2 border-t border-[#E2E8F0]">
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-medium text-[#475569] flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-[#4338CA]" strokeWidth={1.5} />
                Position Coordinates
              </span>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={gettingLocation}
                className="text-[12px] text-[#4338CA] hover:underline flex items-center gap-1"
              >
                <Navigation className={`w-3 h-3 ${gettingLocation ? 'animate-spin' : ''}`} strokeWidth={1.5} />
                <span>{gettingLocation ? 'Locating…' : 'Use GPS'}</span>
              </button>
            </div>

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
              {submitting ? 'Registering…' : 'Register Unit'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

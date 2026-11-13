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
    <div className="fixed inset-0 z-[1000] bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-md p-6 text-xs shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
              <Shield className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-slate-900 text-sm">Register Emergency Unit</h3>
              <p className="text-[11px] text-slate-400">Hyderabad Patrol & Rescue Roster</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3.5">
          <div>
            <label className="text-slate-700 font-bold text-xs">Unit Identifier (e.g. PATROL-104)</label>
            <input
              type="text"
              placeholder="Auto-generated if blank"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-slate-700 font-bold text-xs">Unit Asset Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
              >
                <option value="patrol">Patrol Vehicle</option>
                <option value="rescue_boat">Rescue Boat (NDRF/SDRF)</option>
                <option value="ambulance">Emergency Ambulance</option>
              </select>
            </div>

            <div>
              <label className="text-slate-700 font-bold text-xs">Capacity (Personnel)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
              />
            </div>
          </div>

          <div>
            <label className="text-slate-700 font-bold text-xs">Station / Base Deployment</label>
            <input
              type="text"
              required
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="w-full mt-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-900 outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 font-medium"
            />
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-slate-700 font-bold text-xs flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-indigo-600" />
                Base Coordinates
              </span>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={gettingLocation}
                className="text-[10px] font-bold bg-white text-indigo-600 border border-slate-200 hover:bg-slate-100 px-2.5 py-1 rounded-lg flex items-center gap-1 transition shadow-xs"
              >
                <Navigation className={`w-3 h-3 ${gettingLocation ? 'animate-spin' : ''}`} />
                <span>{gettingLocation ? 'Detecting...' : 'Use Device GPS'}</span>
              </button>
            </div>

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
              {submitting ? 'Registering...' : 'Confirm Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

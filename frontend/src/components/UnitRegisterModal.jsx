import React, { useState } from 'react';
import { Shield, X, MapPin, Navigation } from 'lucide-react';

export default function UnitRegisterModal({ isOpen, onClose, onRegister }) {
  const [unitId, setUnitId] = useState('');
  const [kind, setKind] = useState('patrol');
  const [station, setStation] = useState('Mylapore Police Station');
  const [lat, setLat] = useState('13.033');
  const [lng, setLng] = useState('80.267');
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
    <div className="fixed inset-0 z-[1000] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111111] border border-gray-800 rounded-xl w-full max-w-md p-5 text-xs shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between border-b border-gray-800 pb-3">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-neutral-300" />
            <h3 className="font-bold text-white text-sm">Register Emergency Unit</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-white">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div>
            <label className="text-gray-400 font-medium">Unit Identifier (e.g. PATROL-104)</label>
            <input
              type="text"
              placeholder="Auto-generated if blank"
              value={unitId}
              onChange={(e) => setUnitId(e.target.value)}
              className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-neutral-400"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-gray-400 font-medium">Unit Asset Kind</label>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-neutral-400"
              >
                <option value="patrol">Patrol Vehicle</option>
                <option value="rescue_boat">Rescue Boat (NDRF/SDRF)</option>
                <option value="ambulance">Emergency Ambulance</option>
              </select>
            </div>

            <div>
              <label className="text-gray-400 font-medium">Capacity (Personnel)</label>
              <input
                type="number"
                min="1"
                max="20"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-neutral-400"
              />
            </div>
          </div>

          <div>
            <label className="text-gray-400 font-medium">Station / Base Deployment</label>
            <input
              type="text"
              required
              value={station}
              onChange={(e) => setStation(e.target.value)}
              className="w-full mt-1 bg-gray-900 border border-gray-800 rounded px-3 py-2 text-white outline-none focus:border-neutral-400"
            />
          </div>

          <div className="bg-gray-900/60 p-3 rounded-lg border border-gray-800 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-gray-300 font-semibold flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-neutral-300" />
                Live Coordinates
              </span>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={gettingLocation}
                className="text-[10px] bg-neutral-900 text-neutral-300 border border-neutral-700 hover:bg-neutral-800 px-2 py-0.5 rounded flex items-center gap-1 transition"
              >
                <Navigation className={`w-3 h-3 ${gettingLocation ? 'animate-spin' : ''}`} />
                <span>{gettingLocation ? 'Detecting...' : 'Use Device GPS'}</span>
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  required
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white outline-none focus:border-neutral-400 text-xs font-mono"
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
                  className="w-full bg-gray-950 border border-gray-800 rounded px-2.5 py-1.5 text-white outline-none focus:border-neutral-400 text-xs font-mono"
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
              className="bg-white text-black hover:bg-neutral-200 px-4 py-2 rounded font-semibold transition disabled:opacity-50"
            >
              {submitting ? 'Registering...' : 'Confirm Registration'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}


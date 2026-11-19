import React, { useCallback, useEffect, useState } from 'react';
import { Camera, LogOut, MapPin, RefreshCw, Upload } from 'lucide-react';
import {
  fetchCitizenMe,
  fetchMyCitizenReports,
  loginCitizen,
  logoutCitizen,
  registerCitizen,
  submitCitizenReport,
} from '../api';

const PHASES = [
  { id: 'before', label: 'Before disaster' },
  { id: 'during', label: 'During event' },
  { id: 'after', label: 'After / post-disaster' },
];

export default function CitizenPortal({ onExit }) {
  const [citizen, setCitizen] = useState(null);
  const [mode, setMode] = useState('login'); // login | register
  const [username, setUsername] = useState('citizen123');
  const [password, setPassword] = useState('citizen');
  const [displayName, setDisplayName] = useState('Citizen Reporter');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState('during');
  const [message, setMessage] = useState('');
  const [photo, setPhoto] = useState(null);
  const [preview, setPreview] = useState('');
  const [coords, setCoords] = useState(null);
  const [geoError, setGeoError] = useState('');
  const [reports, setReports] = useState([]);
  const [submitMsg, setSubmitMsg] = useState('');

  const refreshMine = useCallback(async () => {
    try {
      setReports(await fetchMyCitizenReports());
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const me = await fetchCitizenMe();
        if (!cancelled && me) {
          setCitizen(me);
          await refreshMine();
        }
      } catch {
        /* not signed in */
      }
    })();
    return () => { cancelled = true; };
  }, [refreshMine]);

  useEffect(() => {
    if (!photo) {
      setPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(photo);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [photo]);

  const captureLocation = () => {
    setGeoError('');
    if (!navigator.geolocation) {
      setGeoError('This browser cannot share GPS. Enter location manually is not available yet — try Chrome on your phone.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({
          lat: Number(pos.coords.latitude.toFixed(6)),
          lng: Number(pos.coords.longitude.toFixed(6)),
          accuracy_m: pos.coords.accuracy != null ? Math.round(pos.coords.accuracy) : null,
        });
      },
      (err) => setGeoError(err.message || 'Could not read GPS.'),
      { enableHighAccuracy: true, timeout: 20000 },
    );
  };

  const handleAuth = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'register'
        ? await registerCitizen(username.trim(), password, displayName.trim())
        : await loginCitizen(username.trim(), password);
      setCitizen(result.citizen);
      setPassword('');
      await refreshMine();
    } catch (err) {
      setError(err.message || 'Authentication failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logoutCitizen();
    } catch (err) {
      console.error(err);
    }
    setCitizen(null);
    setReports([]);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitMsg('');
    setError('');
    if (!photo) {
      setError('Add a photo of the waterlogging or damage.');
      return;
    }
    if (!coords) {
      setError('Share your GPS location so officers can place the report on the map.');
      return;
    }
    setBusy(true);
    try {
      await submitCitizenReport({
        lat: coords.lat,
        lng: coords.lng,
        phase,
        message,
        photo,
      });
      setMessage('');
      setPhoto(null);
      setSubmitMsg('Report sent. Watch officers can see it on the tactical map as unverified until they review it.');
      await refreshMine();
    } catch (err) {
      setError(err.message || 'Could not submit report.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="h-full max-h-[100dvh] bg-[#F8FAFC] text-[#0F172A] flex flex-col overflow-hidden">
      <header className="h-[56px] border-b border-[#E2E8F0] bg-white px-4 sm:px-6 flex items-center justify-between shrink-0">
        <div>
          <div className="text-[14px] font-semibold">Vanta · Citizen reports</div>
          <div className="text-[12px] text-[#64748B]">Photo + GPS field intake for Hyderabad</div>
        </div>
        <div className="flex items-center gap-2">
          {citizen && (
            <span className="hidden sm:inline text-[12px] text-[#475569]">
              {citizen.display_name || citizen.username}
            </span>
          )}
          {citizen && (
            <button
              type="button"
              onClick={handleLogout}
              className="h-8 px-2.5 rounded-[6px] border border-[#E2E8F0] text-[12px] inline-flex items-center gap-1 hover:bg-[#F8FAFC]"
            >
              <LogOut className="w-3.5 h-3.5" /> Sign out
            </button>
          )}
          <button
            type="button"
            onClick={onExit}
            className="h-8 px-2.5 rounded-[6px] border border-[#E2E8F0] text-[12px] hover:bg-[#F8FAFC]"
          >
            Back
          </button>
        </div>
      </header>

      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4 sm:px-6 py-6">
        <div className="mx-auto w-full max-w-lg flex flex-col gap-5 pb-8">
          {!citizen ? (
            <form onSubmit={handleAuth} className="bg-white border border-[#E2E8F0] rounded-[8px] p-5 flex flex-col gap-3">
              <h1 className="text-[18px] font-semibold">
                {mode === 'register' ? 'Create citizen account' : 'Citizen sign-in'}
              </h1>
              <p className="text-[13px] text-[#64748B]">
                Demo login: <span className="font-medium text-[#0F172A]">citizen123</span> /{' '}
                <span className="font-medium text-[#0F172A]">citizen</span>. Reports stay unverified until a watch officer reviews them.
              </p>
              {mode === 'register' && (
                <label className="text-[12px] font-medium text-[#475569]">
                  Display name
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    className="mt-1 h-10 w-full rounded-[6px] border border-[#E2E8F0] px-3 text-[14px]"
                    placeholder="Optional"
                  />
                </label>
              )}
              <label className="text-[12px] font-medium text-[#475569]">
                Username
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  className="mt-1 h-10 w-full rounded-[6px] border border-[#E2E8F0] px-3 text-[14px]"
                />
              </label>
              <label className="text-[12px] font-medium text-[#475569]">
                Password
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                  className="mt-1 h-10 w-full rounded-[6px] border border-[#E2E8F0] px-3 text-[14px]"
                />
              </label>
              {error && <div className="text-[12px] text-[#DC2626]">{error}</div>}
              <button
                type="submit"
                disabled={busy}
                className="h-11 rounded-[6px] bg-[#4338CA] text-white text-[14px] font-medium disabled:opacity-60"
              >
                {busy ? 'Please wait…' : mode === 'register' ? 'Create account' : 'Sign in'}
              </button>
              <button
                type="button"
                className="text-[12px] text-[#4338CA] hover:underline"
                onClick={() => { setMode(mode === 'register' ? 'login' : 'register'); setError(''); }}
              >
                {mode === 'register' ? 'Already have an account? Sign in' : 'New here? Create an account'}
              </button>
            </form>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="bg-white border border-[#E2E8F0] rounded-[8px] p-5 flex flex-col gap-3">
                <h1 className="text-[18px] font-semibold">Submit a field photo</h1>
                <p className="text-[13px] text-[#64748B]">
                  Take or upload a picture of waterlogging or damage. Officers see it on the tactical map as a citizen report.
                </p>

                <div className="flex flex-wrap gap-2">
                  {PHASES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setPhase(item.id)}
                      className={`h-8 px-3 rounded-[6px] text-[12px] font-medium border ${
                        phase === item.id
                          ? 'bg-[#EEF2FF] border-[#C7D2FE] text-[#3730A3]'
                          : 'bg-white border-[#E2E8F0] text-[#475569]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                <label className="text-[12px] font-medium text-[#475569]">
                  What do you see?
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    required
                    rows={3}
                    className="mt-1 w-full rounded-[6px] border border-[#E2E8F0] px-3 py-2 text-[14px]"
                    placeholder="e.g. Knee-deep water on the underpass road"
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <label className="h-24 border border-dashed border-[#CBD5E1] rounded-[6px] flex flex-col items-center justify-center gap-1 text-[12px] text-[#475569] cursor-pointer hover:bg-[#F8FAFC]">
                    <Camera className="w-5 h-5 text-[#4338CA]" />
                    <span className="inline-flex items-center gap-1"><Upload className="w-3.5 h-3.5" /> Take / choose photo</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      className="hidden"
                      onChange={(e) => setPhoto(e.target.files?.[0] || null)}
                    />
                  </label>
                  {preview && (
                    <img src={preview} alt="Selected upload" className="max-h-48 w-full object-cover rounded-[6px] border border-[#E2E8F0]" />
                  )}
                </div>

                <button
                  type="button"
                  onClick={captureLocation}
                  className="h-10 rounded-[6px] border border-[#E2E8F0] text-[13px] font-medium inline-flex items-center justify-center gap-2 hover:bg-[#F8FAFC]"
                >
                  <MapPin className="w-4 h-4 text-[#4338CA]" />
                  {coords ? `GPS ${coords.lat}, ${coords.lng}` : 'Use my current location'}
                </button>
                {coords?.accuracy_m != null && (
                  <div className="text-[11px] text-[#64748B]">Approx. accuracy ±{coords.accuracy_m} m</div>
                )}
                {geoError && <div className="text-[12px] text-[#DC2626]">{geoError}</div>}
                {error && <div className="text-[12px] text-[#DC2626]">{error}</div>}
                {submitMsg && <div className="text-[12px] text-[#047857]">{submitMsg}</div>}

                <button
                  type="submit"
                  disabled={busy}
                  className="h-11 rounded-[6px] bg-[#4338CA] text-white text-[14px] font-medium disabled:opacity-60"
                >
                  {busy ? 'Sending…' : 'Send to watch officers'}
                </button>
              </form>

              <section className="bg-white border border-[#E2E8F0] rounded-[8px] p-5">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-[14px] font-semibold">Your reports</h2>
                  <button type="button" onClick={refreshMine} className="text-[12px] text-[#4338CA] inline-flex items-center gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </button>
                </div>
                {reports.length === 0 ? (
                  <p className="text-[12px] text-[#64748B]">No reports yet.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-[#E2E8F0]">
                    {reports.map((report) => (
                      <li key={report.id} className="py-2.5 text-[12px]">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium text-[#0F172A] uppercase">{report.phase}</span>
                          <span className="px-2 py-0.5 rounded-[4px] bg-[#F1F5F9] text-[#475569]">{report.status}</span>
                        </div>
                        <div className="text-[#334155] mt-1">{report.message}</div>
                        <div className="text-[#64748B] mt-1">{new Date(report.created_at).toLocaleString()}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </main>
    </div>
  );
}

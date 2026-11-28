import React, { useState } from 'react';
import { BookOpen, Boxes, Camera, Download, Sparkles } from 'lucide-react';

const TABS = [
  { id: 'install', label: 'Install', Icon: Download },
  { id: 'novelty', label: 'Novelty', Icon: Sparkles },
  { id: 'architecture', label: 'Architecture', Icon: Boxes },
  { id: 'gallery', label: 'Gallery', Icon: Camera },
];

const GALLERY = [
  { src: '/docs-gallery/cap-feed.png', title: '01 · Official alert feed', caption: 'CAP messages, district matching, and feed health' },
  { src: '/docs-gallery/tactical-map.png', title: '02 · Tactical map', caption: 'Independent hazard layers, hotspots, and incident context' },
  { src: '/docs-gallery/radar.png', title: '03 · Atmospheric radar', caption: 'Radar and weather overlays for Hyderabad and the region' },
  { src: '/docs-gallery/ai-briefing.png', title: '04 · AI briefing', caption: 'Run Predict, Prepare, and Respond when an officer asks' },
  { src: '/docs-gallery/citizen-submit.png', title: '05 · Citizen reporting', caption: 'Submit a field photo and area for officer review' },
  { src: '/docs-gallery/officer-review.png', title: '06 · Officer review', caption: 'Inspect a report, then accept it as an incident or reject it' },
  { src: '/docs-gallery/citizen-reports.png', title: '07 · Report status', caption: 'Citizens can see whether a report is pending or accepted' },
];

function CodeBlock({ children }) {
  return (
    <pre className="mt-2 overflow-x-auto rounded-[6px] border border-[#E2E8F0] bg-[#0F172A] px-4 py-3 text-[12px] leading-relaxed text-[#E2E8F0] vp-mono whitespace-pre-wrap">
      {children}
    </pre>
  );
}

function InstallSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">Run Vanta locally</h2>
        <p className="mt-2 text-[14px] text-[#475569] leading-relaxed">
          Prerequisites: Python 3.10+, Node.js 18+ (npm), and two terminal windows. Secrets belong in <code className="vp-mono text-[12px]">.env</code>, which is ignored by Git.
        </p>
      </div>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">1. Create the Python environment</h3>
        <p className="mt-1 text-[13px] text-[#64748B]">Windows PowerShell</p>
        <CodeBlock>{`python -m venv venv
.\\venv\\Scripts\\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt`}</CodeBlock>
        <p className="mt-3 text-[13px] text-[#64748B]">macOS / Linux</p>
        <CodeBlock>{`python3 -m venv venv
source venv/bin/activate
python -m pip install --upgrade pip
pip install -r requirements.txt`}</CodeBlock>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">2. Configure the environment</h3>
        <CodeBlock>{`copy .env.example .env`}</CodeBlock>
        <p className="mt-2 text-[13px] text-[#475569]">Set local officer login values:</p>
        <CodeBlock>{`AUTH_REQUIRED=true
BOOTSTRAP_OFFICER_USERNAME=watch.officer
BOOTSTRAP_OFFICER_PASSWORD=choose-a-private-password
BOOTSTRAP_OFFICER_DISPLAY_NAME=Watch Officer`}</CodeBlock>
        <p className="mt-2 text-[13px] text-[#475569]">Optional: <code className="vp-mono text-[12px]">GROQ_API_KEY</code>, <code className="vp-mono text-[12px]">GEMINI_API_KEY</code>, <code className="vp-mono text-[12px]">MAP_KEY</code> (FIRMS).</p>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">3. Install frontend packages</h3>
        <CodeBlock>{`cd frontend
npm install
cd ..`}</CodeBlock>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">4. Start the API</h3>
        <CodeBlock>{`.\\venv\\Scripts\\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`}</CodeBlock>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">5. Start the web app</h3>
        <CodeBlock>{`cd frontend
npm run dev`}</CodeBlock>
        <p className="mt-2 text-[13px] text-[#475569]">
          Open <span className="vp-mono text-[12px]">http://127.0.0.1:5173</span> and sign in with bootstrap credentials from <code className="vp-mono text-[12px]">.env</code>.
        </p>
        <div className="mt-3 overflow-hidden rounded-[6px] border border-[#E2E8F0]">
          <table className="w-full text-left text-[13px]">
            <thead className="bg-[#F8FAFC] text-[#64748B]">
              <tr>
                <th className="px-3 py-2 font-medium">Endpoint</th>
                <th className="px-3 py-2 font-medium">Purpose</th>
              </tr>
            </thead>
            <tbody className="text-[#334155]">
              <tr className="border-t border-[#E2E8F0]"><td className="px-3 py-2 vp-mono text-[12px]">127.0.0.1:5173</td><td className="px-3 py-2">Control room</td></tr>
              <tr className="border-t border-[#E2E8F0]"><td className="px-3 py-2 vp-mono text-[12px]">127.0.0.1:8000/api/health</td><td className="px-3 py-2">API health</td></tr>
              <tr className="border-t border-[#E2E8F0]"><td className="px-3 py-2 vp-mono text-[12px]">127.0.0.1:8000/docs</td><td className="px-3 py-2">Interactive API docs</td></tr>
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function NoveltySection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">What makes Vanta different</h2>
        <p className="mt-2 text-[14px] text-[#475569] leading-relaxed">
          Vanta is a <strong className="font-semibold text-[#0F172A]">decision-support system, not an automatic dispatcher</strong>.
          It brings live hazard signals, citizen reports, and operational context into one control room. Recommendations stay explainable; an officer approves actions that matter.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { title: 'One city, multiple signals', body: 'Urban waterlogging screening, official alerts, earthquake observations, cyclone tracks, and wildfire detections.' },
          { title: 'One clear decision loop', body: 'Monitor → assess → prepare → review. Evidence and freshness stay visible.' },
          { title: 'One human in control', body: 'No automatic dispatch, SMS, or calendar action. Hazards are never collapsed into a misleading total-risk number.' },
        ].map((card) => (
          <div key={card.title} className="rounded-[8px] border border-[#E2E8F0] bg-white p-4">
            <h3 className="text-[14px] font-semibold text-[#0F172A]">{card.title}</h3>
            <p className="mt-2 text-[13px] text-[#475569] leading-relaxed">{card.body}</p>
          </div>
        ))}
      </div>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">Built for human decisions</h3>
        <ul className="mt-3 space-y-2 text-[14px] text-[#475569] leading-relaxed list-disc pl-5">
          <li><strong className="text-[#0F172A]">Independent hazard scales.</strong> Flood, earthquake, cyclone, and wildfire stay separate. <code className="vp-mono text-[12px]">total_risk_score</code> is always <code className="vp-mono text-[12px]">null</code>.</li>
          <li><strong className="text-[#0F172A]">Evidence before action.</strong> Suggestions include context and source status; AI agents run only on explicit request.</li>
          <li><strong className="text-[#0F172A]">No fabricated activity.</strong> Incidents and units come from real input. Missing or stale feeds stay visibly missing or stale.</li>
          <li><strong className="text-[#0F172A]">Officer approval gates actions.</strong> No automatic dispatch, SMS, evacuation calendar write, or hazard-action approval.</li>
          <li><strong className="text-[#0F172A]">Replay is read-only.</strong> Historical replay is labelled and does not write to live operations.</li>
        </ul>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">Hyderabad first</h3>
        <p className="mt-2 text-[14px] text-[#475569] leading-relaxed">
          The pilot focuses on Greater Hyderabad and GHMC: ~64 HTP waterlogging points, a 120-cell city grid, district-matched CAP alerts, and independent regional hazard feeds. The UI reports source health and never treats a missing feed as a clear area.
        </p>
      </section>
    </div>
  );
}

function ArchitectureSection() {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h2 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">How the pieces fit</h2>
        <p className="mt-2 text-[14px] text-[#475569] leading-relaxed">
          FastAPI backend + React/Vite control room. Live feeds and citizen reports flow into screening, map/alerts/briefing, then officer review before any operational action.
        </p>
      </div>

      <section className="rounded-[8px] border border-[#E2E8F0] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">Response loop</h3>
        <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px]">
          {['Live feeds & citizen reports', 'Screen & match evidence', 'Map, alerts & briefing', 'Officer reviews', 'Approve → action / Reject → no dispatch'].map((step, i) => (
            <React.Fragment key={step}>
              {i > 0 && <span className="text-[#CBD5E1]">→</span>}
              <span className="rounded-[6px] border border-[#E2E8F0] bg-[#F8FAFC] px-2.5 py-1.5 text-[#0F172A]">{step}</span>
            </React.Fragment>
          ))}
        </div>
      </section>

      <section className="rounded-[8px] border border-[#E2E8F0] bg-white p-5">
        <h3 className="text-[13px] font-semibold text-[#64748B] uppercase tracking-wider">System map</h3>
        <ul className="mt-3 space-y-2 text-[14px] text-[#475569]">
          <li><strong className="text-[#0F172A]">Officer / citizen</strong> → React + Vite control room</li>
          <li><strong className="text-[#0F172A]">UI</strong> → FastAPI API and local auth</li>
          <li><strong className="text-[#0F172A]">API</strong> → Alerts, incidents, units, routes · flood screening · hazard modules · on-demand AI briefing</li>
          <li><strong className="text-[#0F172A]">Data</strong> → SQLite officer data · Open-Meteo / HTP · USGS, IBTrACS, FIRMS · OSM / OSRM · Groq + Gemini</li>
        </ul>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">Control-room areas</h3>
        <div className="mt-3 overflow-hidden rounded-[6px] border border-[#E2E8F0]">
          <table className="w-full text-left text-[13px]">
            <tbody className="text-[#334155]">
              {[
                ['Alerts', 'CAP / SACHET messages matched to Greater Hyderabad'],
                ['Tactical Map', 'HTP hotspots, grid, incidents, units, independent hazard layers'],
                ['Radar', 'Radar, rain, wind, cloud, temperature, and pressure overlays'],
                ['AI Briefing', 'On-demand Predict (Groq), Prepare & Respond (Gemini)'],
                ['Citizen reports', 'Photo and area intake, watch-officer review'],
              ].map(([area, desc]) => (
                <tr key={area} className="border-t border-[#E2E8F0] first:border-0">
                  <td className="px-3 py-2.5 font-medium text-[#0F172A] whitespace-nowrap">{area}</td>
                  <td className="px-3 py-2.5 text-[#475569]">{desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h3 className="text-[15px] font-semibold text-[#0F172A]">Project map</h3>
        <CodeBlock>{`backend/     FastAPI app, auth, data clients, services, hazard modules
frontend/    React + Vite application and control-room components
data/        Packaged public extracts, HTP seeds, and labels
scripts/     Dataset refresh, validation, training, and backtest
tests/       Automated test suite
docs/        API, pipeline, implementation, limitations, model notes`}</CodeBlock>
      </section>
    </div>
  );
}

function GallerySection() {
  const [active, setActive] = useState(0);
  const shot = GALLERY[active];
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-[20px] font-semibold text-[#0F172A] tracking-tight">Control-room gallery</h2>
        <p className="mt-2 text-[14px] text-[#475569] leading-relaxed">
          Product screens from the Vanta Protocol README — select a shot to enlarge it.
        </p>
      </div>

      <div className="rounded-[8px] border border-[#E2E8F0] bg-[#0F172A] overflow-hidden">
        <img
          src={shot.src}
          alt={shot.title}
          className="w-full max-h-[420px] object-contain bg-[#0F172A]"
        />
        <div className="border-t border-white/10 px-4 py-3 bg-[#0F172A]">
          <div className="text-[14px] font-medium text-white">{shot.title}</div>
          <div className="text-[13px] text-[#94A3B8] mt-0.5">{shot.caption}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {GALLERY.map((item, index) => (
          <button
            key={item.src}
            type="button"
            onClick={() => setActive(index)}
            className={`text-left rounded-[8px] border overflow-hidden transition ${
              index === active ? 'border-[#4338CA] ring-2 ring-[#4338CA]/20' : 'border-[#E2E8F0] hover:border-[#CBD5E1]'
            }`}
          >
            <img src={item.src} alt="" className="w-full h-24 object-cover bg-[#F1F5F9]" />
            <div className="px-2.5 py-2 bg-white">
              <div className="text-[12px] font-medium text-[#0F172A] truncate">{item.title}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DocsPage() {
  const [tab, setTab] = useState('install');

  return (
    <div className="absolute inset-0 z-[450] overflow-hidden bg-white flex">
      <aside className="w-52 shrink-0 border-r border-[#E2E8F0] bg-white py-4 px-2 hidden sm:flex flex-col gap-1">
        <div className="px-2 pb-3 flex items-center gap-2 text-[12px] font-medium text-[#64748B]">
          <BookOpen className="w-3.5 h-3.5" strokeWidth={1.5} />
          Documentation
        </div>
        {TABS.map(({ id, label, Icon }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`relative h-9 rounded-[6px] px-3 flex items-center gap-2.5 text-left text-[14px] transition ${
              tab === id ? 'bg-[#F4F4F5] text-[#18181B] font-medium' : 'text-[#52525B] hover:bg-[#FAFAFA]'
            }`}
          >
            {tab === id && <span className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-zinc-900" />}
            <Icon className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            {label}
          </button>
        ))}
      </aside>

      <div className="flex-1 overflow-y-auto bg-white">
        <div className="sm:hidden sticky top-0 z-10 flex gap-1 border-b border-[#E2E8F0] bg-white px-3 py-2 overflow-x-auto">
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`h-8 px-3 rounded-[6px] text-[13px] whitespace-nowrap ${
                tab === id ? 'bg-[#F4F4F5] text-[#18181B] font-medium' : 'text-[#71717A]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="mx-auto w-full max-w-3xl px-4 sm:px-8 py-8 pb-16">
          {tab === 'install' && <InstallSection />}
          {tab === 'novelty' && <NoveltySection />}
          {tab === 'architecture' && <ArchitectureSection />}
          {tab === 'gallery' && <GallerySection />}
        </div>
      </div>
    </div>
  );
}

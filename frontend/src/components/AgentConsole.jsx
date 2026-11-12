import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Activity, AlertCircle, ArrowRight, Bot, CheckCircle2, ChevronRight,
  CircleDot, Clock, Radar, Route, ShieldCheck, Sparkles, X
} from 'lucide-react';
import { fetchAgents, runAgent, approveAgentAction, rejectAgentAction } from '../api';

/* Phase color tokens (matches index.css) */
const PHASE = {
  predict: { color: '#22d3ee', dim: 'rgba(34,211,238,0.08)', label: 'PREDICT' },
  prepare: { color: '#f5a524', dim: 'rgba(245,165,36,0.08)', label: 'PREPARE' },
  respond: { color: '#fb7185', dim: 'rgba(251,113,133,0.08)', label: 'RESPOND' },
};

const STATUS = {
  idle:           { text: 'Idle',           tone: 'text-slate-400' },
  running:        { text: 'Running…',       tone: 'text-cyan-300' },
  needs_approval: { text: 'Needs approval', tone: 'text-amber-300' },
  error:          { text: 'Error',          tone: 'text-rose-400' },
  offline:        { text: 'Not connected',  tone: 'text-slate-500' },
};

function timeAgo(ts) {
  if (!ts) return 'never';
  const s = Math.max(0, (Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 60) return `${Math.floor(s)}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return new Date(ts).toLocaleTimeString();
}

function AgentCard({ agent, onRun, onApprove, onReject, busy }) {
  const phase = PHASE[agent.phase] || PHASE.predict;
  const st = STATUS[agent.status] || STATUS.idle;
  const pending = agent.pending_actions || [];

  return (
    <div
      className="v-card v-card-hover v-view-enter relative overflow-hidden transition-shadow hover:shadow-[0_8px_30px_-12px_rgba(0,0,0,0.8)]"
      style={{ '--accent': phase.color }}
    >
      {/* accent top line */}
      <div className="h-[2px] w-full" style={{ background: `linear-gradient(90deg, ${phase.color}, transparent 70%)` }} />

      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-lg flex items-center justify-center border"
              style={{ background: phase.dim, borderColor: `${phase.color}44`, color: phase.color }}
            >
              <Bot className="w-4.5 h-4.5" />
            </div>
            <div>
              <div className="font-bold text-white text-sm leading-tight">{agent.name}</div>
              <div className="v-label mt-0.5" style={{ color: phase.color }}>{phase.label} PHASE</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] font-semibold">
            {agent.status === 'running' && <span className="v-dot w-1.5 h-1.5 rounded-full" style={{ background: phase.color, color: phase.color }} />}
            <span className={st.tone}>{st.text}</span>
          </div>
        </div>

        {/* Goal */}
        <div className="text-[12px] leading-relaxed" style={{ color: 'var(--vanta-text-dim)' }}>
          {agent.goal}
        </div>

        {/* Last report */}
        {agent.last_report && (
          <div className="v-panel p-2.5 text-[11px] leading-relaxed" style={{ color: 'var(--vanta-text-dim)' }}>
            <div className="v-label flex items-center gap-1 mb-1">
              <Sparkles className="w-3 h-3" /> Last report
              <span className="ml-auto normal-case tracking-normal font-medium" style={{ color: 'var(--vanta-text-faint)' }}>
                <Clock className="w-2.5 h-2.5 inline" /> {timeAgo(agent.last_run)}
              </span>
            </div>
            <div className="text-slate-200">{agent.last_report}</div>
          </div>
        )}

        {/* Pending actions — officer approval queue */}
        {pending.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <div className="v-label flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" /> Awaiting officer approval ({pending.length})
            </div>
            {pending.map((a) => (
              <div key={a.id} className="v-panel p-2.5 flex items-center justify-between gap-2">
                <div className="text-[11px] leading-snug">
                  <div className="text-white font-semibold">{a.title}</div>
                  <div style={{ color: 'var(--vanta-text-faint)' }}>{a.detail}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => onReject(a.id)}
                    disabled={busy}
                    className="text-[11px] px-2 py-1 rounded-md border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition disabled:opacity-40"
                  >
                    Reject
                  </button>
                  <button
                    onClick={() => onApprove(a.id)}
                    disabled={busy}
                    className="text-[11px] px-2.5 py-1 rounded-md font-semibold text-black transition disabled:opacity-40"
                    style={{ background: phase.color }}
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Run */}
        <button
          onClick={() => onRun(agent.id)}
          disabled={busy || agent.status === 'running'}
          className="mt-auto w-full py-2 rounded-lg text-[12px] font-bold text-black flex items-center justify-center gap-1.5 transition hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: phase.color }}
        >
          {agent.status === 'running' ? (
            <><CircleDot className="w-3.5 h-3.5 animate-spin" /> Cycle in progress…</>
          ) : (
            <>Run {agent.name} <ArrowRight className="w-3.5 h-3.5" /></>
          )}
        </button>
      </div>
    </div>
  );
}

function ActivityFeed({ agents }) {
  const items = agents
    .flatMap((a) => (a.activity || []).map((e) => ({ ...e, phase: a.phase, agent: a.name })))
    .sort((x, y) => new Date(y.ts) - new Date(x.ts))
    .slice(0, 12);

  return (
    <div className="v-card p-4 v-view-enter">
      <div className="v-label flex items-center gap-1.5 mb-3">
        <Activity className="w-3 h-3" /> Agent activity
      </div>
      {items.length === 0 ? (
        <div className="text-[11px]" style={{ color: 'var(--vanta-text-faint)' }}>
          No agent cycles logged yet. Run an agent to generate activity.
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((e, i) => {
            const phase = PHASE[e.phase] || PHASE.predict;
            return (
              <div key={i} className="flex gap-3 py-1.5 items-start">
                <div className="mt-1.5 w-1.5 h-1.5 rounded-full shrink-0" style={{ background: phase.color }} />
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-slate-200 leading-snug">
                    <span className="font-semibold" style={{ color: phase.color }}>{e.agent}</span>
                    {' — '}{e.text}
                  </div>
                </div>
                <div className="v-mono text-[10px] shrink-0" style={{ color: 'var(--vanta-text-faint)' }}>
                  {timeAgo(e.ts)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function AgentConsole({ onNotify }) {
  const [agents, setAgents] = useState(null);   // null = loading, [] = empty
  const [endpointMissing, setEndpointMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const mounted = useRef(true);

  useEffect(() => () => { mounted.current = false; }, []);

  const load = useCallback(async () => {
    try {
      const data = await fetchAgents();
      if (!mounted.current) return;
      setAgents(Array.isArray(data) ? data : data.agents || []);
      setEndpointMissing(false);
      setError(null);
    } catch (e) {
      if (!mounted.current) return;
      if (e.message === 'AGENT_ENDPOINT_MISSING') {
        setEndpointMissing(true);
        setAgents([]);
      } else {
        setError(e.message);
        setAgents([]);
      }
    }
  }, []);

  useEffect(() => { load(); const t = setInterval(load, 30000); return () => clearInterval(t); }, [load]);

  const handleRun = async (id) => {
    setBusy(true);
    try {
      await runAgent(id);
      await load();
    } catch (e) {
      setError(e.message === 'AGENT_ENDPOINT_MISSING'
        ? 'Agent run endpoint not implemented on the backend yet.'
        : e.message);
    } finally { setBusy(false); }
  };

  const handleApprove = async (actionId) => {
    setBusy(true);
    try { await approveAgentAction(actionId); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  const handleReject = async (actionId) => {
    setBusy(true);
    try { await rejectAgentAction(actionId); await load(); }
    catch (e) { setError(e.message); } finally { setBusy(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 v-view-enter">
      <div className="max-w-5xl mx-auto flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
              <Radar className="w-5 h-5 text-cyan-400" /> Agent Command
            </h1>
            <p className="text-[12px] mt-1" style={{ color: 'var(--vanta-text-dim)' }}>
              Three autonomous agents cover the disaster lifecycle. Every dispatch requires officer approval.
            </p>
          </div>
          <div className="v-panel px-3 py-1.5 text-[11px] flex items-center gap-2" style={{ color: 'var(--vanta-text-dim)' }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 v-dot" style={{ color: '#34d399' }} />
            Auto-refresh 30s
          </div>
        </div>

        {/* Honest connection states (zero-mock policy) */}
        {endpointMissing && (
          <div className="v-panel p-4 flex items-start gap-3 border-amber-900/60" style={{ borderColor: 'rgba(245,165,36,0.35)' }}>
            <AlertCircle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
            <div className="text-[12px] leading-relaxed" style={{ color: 'var(--vanta-text-dim)' }}>
              <span className="font-semibold text-amber-300">Agent API not connected.</span> The backend does not expose{' '}
              <code className="v-mono text-amber-200">/api/agents</code> yet — the UI shows no fabricated data per the
              repo's zero-mock policy. Implement the contract in{' '}
              <code className="v-mono text-amber-200">docs/UI_API_CONTRACT.md</code> to bring this console online.
            </div>
          </div>
        )}
        {error && !endpointMissing && (
          <div className="v-panel p-3 flex items-center gap-2 text-[12px] text-rose-300 border-rose-900/60">
            <AlertCircle className="w-4 h-4" /> {error}
            <button onClick={() => setError(null)} className="ml-auto text-rose-200 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Agent grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents === null
            ? [0, 1, 2].map((i) => <div key={i} className="v-card h-64 animate-pulse" />)
            : agents.map((a) => (
                <AgentCard key={a.id} agent={a} onRun={handleRun} onApprove={handleApprove} onReject={handleReject} busy={busy} />
              ))}
        </div>

        {/* Activity */}
        <ActivityFeed agents={agents || []} />
      </div>
    </div>
  );
}

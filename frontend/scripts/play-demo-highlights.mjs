#!/usr/bin/env node
/**
 * Play short UltraDemo highlight clips from the terminal (never the full walkthrough).
 *
 * Usage (from frontend/):
 *   npm run demo:highlights
 *   npm run demo:highlights -- alerts
 */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VIDEO = path.resolve(__dirname, '../public/demo-media/Vanta-Protocol-UltraDemo.mp4');

const HIGHLIGHTS = [
  { id: 'signin', label: 'Sign-in', start: 8, end: 11.5 },
  { id: 'alerts', label: 'Alerts', start: 38, end: 41.5 },
  { id: 'radar', label: 'Radar', start: 74, end: 77.5 },
  { id: 'agents', label: 'Agents', start: 114, end: 117.5 },
  { id: 'map', label: 'Map', start: 160, end: 163.5 },
];

function hasCmd(cmd) {
  const result = process.platform === 'win32'
    ? spawnSync('where.exe', [cmd], { encoding: 'utf8' })
    : spawnSync('which', [cmd], { encoding: 'utf8' });
  return result.status === 0;
}

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${cmd} exited with code ${code}`));
    });
  });
}

function openFile(filePath) {
  if (process.platform === 'win32') {
    spawnSync('cmd', ['/c', 'start', '', filePath], { stdio: 'ignore' });
  } else if (process.platform === 'darwin') {
    spawnSync('open', [filePath], { stdio: 'ignore' });
  } else {
    spawnSync('xdg-open', [filePath], { stdio: 'ignore' });
  }
}

async function playClip(clip) {
  const duration = Math.max(0.5, clip.end - clip.start);
  console.log(`▶ ${clip.label}  (${clip.start}s → ${clip.end}s)`);

  if (hasCmd('ffplay')) {
    await run('ffplay', [
      '-hide_banner',
      '-loglevel', 'error',
      '-autoexit',
      '-window_title', `Vanta · ${clip.label}`,
      '-ss', String(clip.start),
      '-t', String(duration),
      VIDEO,
    ]);
    return;
  }

  if (hasCmd('ffmpeg')) {
    const out = path.resolve(__dirname, `../public/demo-media/.highlight-${clip.id}.mp4`);
    spawnSync(
      'ffmpeg',
      ['-y', '-hide_banner', '-loglevel', 'error', '-ss', String(clip.start), '-t', String(duration), '-i', VIDEO, '-c', 'copy', out],
      { encoding: 'utf8' },
    );
    if (fs.existsSync(out)) {
      openFile(out);
      await new Promise((r) => setTimeout(r, Math.ceil(duration * 1000) + 400));
      return;
    }
  }

  openFile(VIDEO);
  console.log(`  Opened full file — scrub to ${clip.start}s–${clip.end}s (install ffmpeg for clip-accurate playback).`);
  await new Promise((r) => setTimeout(r, Math.ceil(duration * 1000) + 400));
}

async function main() {
  if (!fs.existsSync(VIDEO)) {
    console.error(`Missing demo video:\n  ${VIDEO}`);
    console.error('Place Vanta-Protocol-UltraDemo.mp4 in frontend/public/demo-media/');
    process.exit(1);
  }

  const arg = (process.argv[2] || '').trim().toLowerCase();
  const selected = arg
    ? HIGHLIGHTS.filter((h) => h.id === arg || h.label.toLowerCase() === arg)
    : HIGHLIGHTS;

  if (!selected.length) {
    console.error(`Unknown highlight "${arg}". Use: ${HIGHLIGHTS.map((h) => h.id).join(', ')}`);
    process.exit(1);
  }

  console.log(`Vanta demo highlights · ${path.basename(VIDEO)}\n`);
  for (const clip of selected) {
    await playClip(clip);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});

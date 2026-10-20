import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { registerPlugin, Capacitor } from '@capacitor/core';
import './style.css';

const NativeDownloads = registerPlugin('VideoDownload');
const KEY = 'direct_video_download_history_v1';
const safeUrl = (raw) => {
  try { const u = new URL(raw.trim()); return ['http:', 'https:'].includes(u.protocol) ? u : null; } catch { return null; }
};
const filenameFromUrl = (url) => {
  try { const path = new URL(url).pathname; const name = decodeURIComponent(path.split('/').filter(Boolean).pop() || 'video.mp4'); return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').slice(0, 140) || 'video.mp4'; } catch { return 'video.mp4'; }
};
const loadHistory = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
function App() {
  const [url, setUrl] = useState('');
  const [previewUrl, setPreviewUrl] = useState('');
  const [history, setHistory] = useState(loadHistory);
  const [jobs, setJobs] = useState({});
  const [error, setError] = useState('');
  const [tab, setTab] = useState('download');
  const [dark, setDark] = useState(true);
  const native = Capacitor.isNativePlatform();

  useEffect(() => { localStorage.setItem(KEY, JSON.stringify(history.slice(0, 100))); }, [history]);
  useEffect(() => {
    if (!native) return;
    const timer = setInterval(async () => {
      const ids = Object.keys(jobs);
      for (const id of ids) {
        try {
          const result = await NativeDownloads.getProgress({ downloadId: Number(id) });
          setJobs(old => ({ ...old, [id]: { ...old[id], ...result } }));
          if (result.status === 'complete' || result.status === 'failed') {
            setHistory(old => old.map(item => item.downloadId === Number(id) ? { ...item, status: result.status, progress: result.progress ?? item.progress } : item));
          }
        } catch (_) { /* A removed/expired download may no longer be queryable. */ }
      }
    }, 900);
    return () => clearInterval(timer);
  }, [native, jobs]);

  const parsed = useMemo(() => safeUrl(url), [url]);
  const preview = () => {
    setError('');
    if (!parsed) { setError('Enter a valid public http:// or https:// video URL.'); return; }
    setPreviewUrl(parsed.href);
    setTab('download');
  };
  const startDownload = async () => {
    setError('');
    if (!parsed) { setError('Enter a valid public http:// or https:// video URL first.'); return; }
    const fileName = filenameFromUrl(parsed.href);
    const item = { id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, url: parsed.href, fileName, date: new Date().toISOString(), status: 'starting', progress: 0 };
    setHistory(old => [item, ...old].slice(0, 100));
    if (native) {
      try {
        const result = await NativeDownloads.startDownload({ url: parsed.href, fileName });
        setJobs(old => ({ ...old, [String(result.downloadId)]: { ...result, status: 'downloading', progress: 0 } }));
        setHistory(old => old.map(h => h.id === item.id ? { ...h, downloadId: result.downloadId, status: 'downloading' } : h));
      } catch (e) {
        setError(e?.message || 'Could not start download. Check the URL and network connection.');
        setHistory(old => old.map(h => h.id === item.id ? { ...h, status: 'failed' } : h));
      }
      return;
    }
    // Browser fallback: servers must allow cross-origin fetch for this path to work.
    try {
      const response = await fetch(parsed.href);
      if (!response.ok) throw new Error(`Server returned HTTP ${response.status}.`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = objectUrl; a.download = fileName; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(objectUrl), 30000);
      setHistory(old => old.map(h => h.id === item.id ? { ...h, status: 'complete', progress: 100 } : h));
    } catch (e) {
      setError(`${e?.message || 'Download failed.'} Open this app as an Android APK for native downloads, or use a direct URL whose server permits browser access (CORS).`);
      setHistory(old => old.map(h => h.id === item.id ? { ...h, status: 'failed' } : h));
    }
  };
  const clearHistory = () => { if (confirm('Clear download history? This does not delete downloaded files.')) setHistory([]); };
  const clearInput = () => { setUrl(''); setPreviewUrl(''); setError(''); };
  const fmtDate = (s) => { try { return new Date(s).toLocaleString(); } catch { return s; } };
  return <main className={dark ? 'app dark' : 'app light'}>
    <header className="top"><div className="brand"><div className="logo">▶</div><div><div className="eyebrow">FAST • SIMPLE • PRIVATE</div><h1>Video Downloader</h1></div></div><button className="theme" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? '☀' : '☾'}</button></header>
    <section className="hero"><div className="pill"><span className="live-dot"/> DIRECT VIDEO LINKS</div><h2>Save videos.<br/><span>Keep them close.</span></h2><p>Download public MP4 and WebM links directly to your device.</p></section>
    <nav className="tabs"><button className={tab === 'download' ? 'active' : ''} onClick={() => setTab('download')}>↓ Download</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>◷ History <span className="count">{history.length}</span></button></nav>
    {tab === 'download' ? <>
      <section className="panel"><label htmlFor="video-url">VIDEO URL</label><div className="urlbox"><span className="linkicon">↗</span><input id="video-url" type="url" inputMode="url" placeholder="https://example.com/video.mp4" value={url} onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && preview()} /><button className="paste" onClick={async () => { try { const text = await navigator.clipboard.readText(); setUrl(text); } catch { setError('Clipboard access is unavailable. Paste the URL into the field.'); } }}>Paste</button></div><div className="actions"><button className="secondary" onClick={preview}>Preview video</button><button className="primary" onClick={startDownload}>↓ Download video</button></div><div className="hint">Supports direct HTTP/HTTPS video files. Platform pages and protected streams are not supported.</div>{error && <div className="error" role="alert">{error}</div>}</section>
      {previewUrl && <section className="panel preview"><div className="section-title"><div><div className="eyebrow">PREVIEW</div><h3>Your video</h3></div><button className="small-btn" onClick={() => setPreviewUrl('')}>Close</button></div><video controls playsInline preload="metadata" src={previewUrl}>Your browser does not support video preview.</video><div className="fileline"><span className="fileicon">▶</span><div className="filetext"><strong>{filenameFromUrl(previewUrl)}</strong><small>Direct video URL</small></div><button className="iconbtn" onClick={startDownload}>↓</button></div></section>}
      <section className="tips"><div className="tip-icon">✓</div><div><strong>Downloads stay on your device</strong><p>Android downloads use the system download manager and are normally saved in your Downloads folder. History is stored locally in this app.</p></div></section>
    </> : <section className="panel"><div className="section-title"><div><div className="eyebrow">YOUR ACTIVITY</div><h3>Download history</h3></div>{history.length > 0 && <button className="small-btn" onClick={clearHistory}>Clear history</button>}</div>{history.length === 0 ? <div className="empty"><div className="empty-icon">◷</div><strong>No downloads yet</strong><p>Your downloaded videos will appear here.</p></div> : <div className="history-list">{history.map(item => { const live = item.downloadId != null ? jobs[String(item.downloadId)] : null; const status = live?.status || item.status; const progress = live?.progress ?? item.progress ?? 0; return <article className="history-item" key={item.id}><div className="fileicon">▶</div><div className="history-info"><strong>{item.fileName}</strong><small>{fmtDate(item.date)}</small><div className={'status ' + status}>{status === 'complete' ? 'Completed' : status === 'failed' ? 'Failed' : status === 'paused' ? 'Paused' : `${Math.max(0, Math.min(100, Math.round(progress)))}% • Downloading`}</div>{status !== 'complete' && status !== 'failed' && <div className="progress"><span style={{width: `${Math.max(0, Math.min(100, progress))}%`}}/></div>}</div><button className="iconbtn" title="Use URL again" onClick={() => { setUrl(item.url); setPreviewUrl(''); setTab('download'); }}>↗</button></article>; })}</div>}</section>}
    <footer><span>VIDEO DOWNLOADER</span><span>{native ? 'ANDROID APP' : 'WEB PREVIEW MODE'} · v1.0</span></footer>
  </main>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);

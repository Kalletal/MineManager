import { useState, useEffect, useRef, createContext, useContext } from 'react';
import { io } from 'socket.io-client';
import { ServerState, Portal, ServerType } from './types';
import { translations, languages } from './i18n';

declare global {
  interface Window {
    electron?: {
      quitApp: () => void;
    };
  }
}

const socket = io('/dashboard');

// Auth & i18n context
interface User { username: string; lang: string; role: 'admin' | 'user'; }
const AuthContext = createContext<{ user: User | null; token: string | null; setAuth: (u: User | null, t: string | null) => void; t: (k: string, vars?: Record<string, string>) => string; appTitle: string; setAppTitle: (title: string) => void }>({ user: null, token: null, setAuth: () => {}, t: k => k, appTitle: 'MineManager', setAppTitle: () => {} });

const api = {
  get: async (url: string, token?: string) => {
    const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
  post: (url: string, body?: object, token?: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) }),
  put: (url: string, body: object, token: string) => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) }),
  del: async (url: string, token?: string) => {
    const res = await fetch(url, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
};

interface VersionInfo { version: string; java: string; }

function PlayersModal({ server, onClose }: { server: ServerState; onClose: () => void }) {
  const playerPositions = (server as any).playerPositions || [];
  const [search, setSearch] = useState('');
  
  const filteredPlayers = server.players.filter(name => 
    name.toLowerCase().includes(search.toLowerCase())
  );
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 600 }}>
        <h2>👥 Joueurs connectés - {server.name}</h2>
        <p style={{ color: '#94a3b8', marginBottom: 16 }}>{server.players.length} joueur(s) en ligne</p>
        
        <input 
          type="text" 
          placeholder="🔍 Rechercher un joueur..." 
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ width: '100%', marginBottom: 16 }}
        />
        
        {filteredPlayers.length === 0 ? (
          <p style={{ textAlign: 'center', color: '#64748b', padding: 32 }}>
            {search ? 'Aucun joueur trouvé' : 'Aucun joueur connecté'}
          </p>
        ) : (
          <div style={{ maxHeight: 400, overflowY: 'auto' }}>
            {filteredPlayers.map((playerName, i) => {
              const pos = playerPositions.find((p: any) => p.name === playerName);
              return (
                <div key={i} style={{ background: '#1e293b', padding: 12, marginBottom: 8, borderRadius: 6, border: '1px solid #334155' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 20 }}>🎮</span>
                    <span style={{ fontWeight: 'bold', fontSize: 16 }}>{playerName}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                    <div>
                      <strong>Position:</strong>
                      <div style={{ fontFamily: 'monospace', marginTop: 4 }}>
                        {pos ? `X: ${pos.x} Y: ${pos.y} Z: ${pos.z}` : 'Chargement...'}
                      </div>
                    </div>
                    <div>
                      <strong>Dimension:</strong>
                      <div style={{ marginTop: 4 }}>{pos ? pos.world : 'Chargement...'}</div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
        
        <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
          <button className="secondary" onClick={onClose}>Fermer</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'en');
  const [appTitle, setAppTitle] = useState(localStorage.getItem('serverTitle') || 'MineManager');

  useEffect(() => {
    if (token) {
      api.get('/api/auth/me', token).then(u => { setUser(u); setLang(u.lang); }).catch(() => { setToken(null); localStorage.removeItem('token'); });
    }
  }, [token]);

  useEffect(() => {
    const updateTitle = () => {
      const newTitle = localStorage.getItem('serverTitle') || 'MineManager';
      setAppTitle(newTitle);
    };
    window.addEventListener('storage', updateTitle);
    const interval = setInterval(updateTitle, 100);
    return () => {
      window.removeEventListener('storage', updateTitle);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      return (e.returnValue = 'Êtes-vous sûr de vouloir fermer MineManager ?');
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  const setAuth = (u: User | null, t: string | null) => {
    setUser(u);
    setToken(t);
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
    if (u) { setLang(u.lang); localStorage.setItem('lang', u.lang); }
  };

  const t = (key: string, vars?: Record<string, string>) => {
    let str = translations[lang]?.[key] || translations['en'][key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { str = str.replace(`{${k}}`, v); });
    return str;
  };

  return (
    <AuthContext.Provider value={{ user, token, setAuth, t, appTitle, setAppTitle }}>
      {user && token ? <Dashboard /> : <Login />}
    </AuthContext.Provider>
  );
}

function Login() {
  const { setAuth, t, appTitle } = useContext(AuthContext);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api.post('/api/auth/login', form);
    if (res.ok) {
      const data = await res.json();
      setAuth(data.user, data.token);
    } else setError(t('invalidCredentials'));
  };

  return (
    <div className="login-page">
      <form className="login-form" onSubmit={submit}>
        <h1>⚡ {appTitle}</h1>
        {error && <div className="error">❌ {error}</div>}
        <input placeholder={t('username')} value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
        <input type="password" placeholder={t('password')} value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
        <button className="primary" type="submit">🚀 {t('login')}</button>
      </form>
    </div>
  );
}

function Dashboard() {
  const { user, token, setAuth, t, appTitle } = useContext(AuthContext);
  const [servers, setServers] = useState<ServerState[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [portals, setPortals] = useState<Portal[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPortalCreate, setShowPortalCreate] = useState(false);
  const [showPortalEdit, setShowPortalEdit] = useState(false);
  const [editingPortal, setEditingPortal] = useState<Portal | null>(null);
  const [showPlayersModal, setShowPlayersModal] = useState<string | null>(null);
  const [serverSearch, setServerSearch] = useState('');
  const [globalPlayerSearch, setGlobalPlayerSearch] = useState('');
  const [tab, setTab] = useState<'overview' | 'properties' | 'backups' | 'logs'>('overview');
  const logsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    socket.on('servers', setServers);
    socket.on('log', ({ serverId, line }: { serverId: string; line: string }) => {
      if (serverId === selected) setLogs(l => [...l.slice(-499), line]);
    });
    return () => { socket.off('servers'); socket.off('log'); };
  }, [selected]);

  useEffect(() => {
    if (selected) {
      api.get(`/api/servers/${selected}/logs`, token!).then(setLogs).catch(e => console.error('Failed to load logs:', e));
      api.get(`/api/portals?serverId=${selected}`, token!).then(setPortals).catch(e => console.error('Failed to load portals:', e));
    }
    setTab('overview');
  }, [selected, token]);

  useEffect(() => { logsRef.current?.scrollTo(0, logsRef.current.scrollHeight); }, [logs]);

  const server = servers.find(s => s.id === selected);

  return (
    <div className="app">
      <div className="sidebar">
        <h1>⚡ {appTitle}</h1>
        <div className="user-menu">
          <button className="secondary" onClick={() => setShowSettings(true)} style={{ flex: 1, padding: '8px 16px' }}>👤 {user?.username}</button>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1 }}>
            <button className="secondary" onClick={() => setAuth(null, null)} style={{ width: '100%', padding: '8px 16px', height: '36px' }}>↗️ {t('logout')}</button>
            <button className="secondary" style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', width: '100%', padding: '8px 16px', height: '36px' }} onClick={async () => {
              if (confirm('Arrêter MineManager ? Tous les serveurs seront arrêtés.')) {
                await api.post('/api/system/shutdown', {}, token!);
                setTimeout(() => {
                  if (window.electron?.quitApp) {
                    window.electron.quitApp();
                  } else {
                    window.close();
                  }
                }, 1000);
              }
            }}>⏻ Arrêter</button>
          </div>
        </div>
        <button className="primary" onClick={() => setShowCreate(true)} style={{ width: '100%' }}>✨ {t('newServer')}</button>
        
        <div style={{ marginTop: 16, marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input 
            type="text" 
            placeholder="🌐 Rechercher un joueur (tous serveurs)..." 
            value={globalPlayerSearch}
            onChange={e => setGlobalPlayerSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
          />
          <input 
            type="text" 
            placeholder="🔍 Rechercher un serveur..." 
            value={serverSearch}
            onChange={e => setServerSearch(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', fontSize: 13 }}
          />
        </div>
        
        <h3>🖥️ {t('servers')}</h3>
        {servers
          .filter(s => {
            // Filter by server name
            if (serverSearch && !s.name.toLowerCase().includes(serverSearch.toLowerCase())) {
              return false;
            }
            // Filter by global player search
            if (globalPlayerSearch && !s.players.some(p => p.toLowerCase().includes(globalPlayerSearch.toLowerCase()))) {
              return false;
            }
            return true;
          })
          .map(s => (
          <div key={s.id} className={`server-item ${s.id === selected ? 'active' : ''}`} onClick={() => setSelected(s.id)}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className={`status ${s.status}`} />
                <strong>{s.name}</strong>
              </div>
              <small style={{ color: '#888' }}>{s.players.length} {t('players')}</small>
            </div>
            <span className={`badge ${s.type}`}>{s.type}</span>
          </div>
        ))}
      </div>

      <div className="main">
        {server ? (
          <>
            <h1>{server.name} <span className={`badge ${server.type}`}>{server.type}</span></h1>
            <p style={{ color: '#888' }}>{t('version')} {server.version} • Port Minecraft {server.port}</p>

            <div className="controls">
              <button className="primary" disabled={server.status !== 'stopped'} onClick={() => api.post(`/api/servers/${server.id}/start`, {}, token!)}>▶️ {t('start')}</button>
              <button className="secondary" disabled={server.status !== 'running'} onClick={() => api.post(`/api/servers/${server.id}/stop`, {}, token!)}>⏹️ {t('stop')}</button>
              <button className="secondary" style={{ marginLeft: 'auto', background: 'linear-gradient(135deg, #ef4444, #dc2626)' }} onClick={() => { 
                if (confirm(`Supprimer le serveur "${server.name}" ? Cette action est irréversible !`)) {
                  api.del(`/api/servers/${server.id}`, token!); 
                  setSelected(null); 
                }
              }}>🗑️ {t('delete')}</button>
            </div>

            <div className="tabs" data-active={['overview', 'properties', 'backups', 'logs'].indexOf(tab)}>
              <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>📊 {t('overview')}</button>
              <button className={tab === 'properties' ? 'active' : ''} onClick={() => setTab('properties')}>⚙️ {t('properties')}</button>
              <button className={tab === 'backups' ? 'active' : ''} onClick={() => setTab('backups')}>💾 {t('backups')}</button>
              <button className={tab === 'logs' ? 'active' : ''} onClick={() => setTab('logs')}>📋 {t('logs')}</button>
            </div>

            {tab === 'overview' && (
              <>
                <div className="metrics">
                  <div className="metric"><div className="metric-value">{t(server.status)}</div><div className="metric-label">Status</div></div>
                  <div className="metric"><div className="metric-value">{(server.tps || 20).toFixed(1)}</div><div className="metric-label">TPS</div></div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, justifyContent: 'center' }}>
                    <div className="metric" style={{ width: '100%' }}><div className="metric-value">{(server.players || []).length}</div><div className="metric-label">{t('players')}</div></div>
                    {server.players.length > 0 && (
                      <div 
                        className="metric" 
                        style={{ cursor: 'pointer', width: '100%' }} 
                        onClick={() => setShowPlayersModal(selected)}
                      >
                        <div className="metric-value" style={{ fontSize: 14 }}>👥 Voir les joueurs</div>
                        <div className="metric-label">{server.players.length} connecté(s)</div>
                      </div>
                    )}
                  </div>
                  <div className="metric"><div className="metric-value">{server.usedMemory || 0}MB</div><div className="metric-label">{t('memory')}</div></div>
                  <div className="metric"><div className="metric-value">{server.serverIp || '127.0.0.1'}</div><div className="metric-label">IP</div></div>
                  <div className="metric"><div className="metric-value">{(server as any).bungeecordPort || 25565}</div><div className="metric-label">Port BungeeCord</div></div>
                </div>

                {showPlayersModal === selected && <PlayersModal server={server} onClose={() => setShowPlayersModal(null)} />}

                <h3>🌀 {t('portals')}</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <span>{portals.length} {t('portals')}</span>
                  <button className="secondary" onClick={() => setShowPortalCreate(true)}>➕ {t('createPortal')}</button>
                </div>
                <PortalDiagram 
                  serverId={server.id} 
                  serverName={server.name}
                  portals={portals} 
                  servers={servers}
                  onOriginClick={(portal) => {
                    setEditingPortal(portal);
                    setShowPortalEdit(true);
                  }}
                  onTargetClick={(targetServerId) => {
                    setSelected(targetServerId);
                  }}
                  onPortalDelete={(portalId) => {
                    api.del(`/api/portals/${portalId}`, token!);
                    setPortals(portals.filter(p => p.id !== portalId));
                  }}
                />
              </>
            )}

            {tab === 'properties' && <PropertiesEditor serverId={server.id} serverStatus={server.status} />}

            {tab === 'backups' && <BackupsPanel serverId={server.id} />}

            {tab === 'logs' && <LogsPanel serverId={server.id} serverStatus={server.status} logs={logs} logsRef={logsRef} />}
          </>
        ) : (
          <div style={{ textAlign: 'center', marginTop: 100, color: '#94a3b8' }}>
            <div style={{ fontSize: 64, marginBottom: 24 }}>🎮</div>
            <h2 style={{ fontSize: 24, fontWeight: 600, marginBottom: 12 }}>{t('welcomeTitle').replace('MineManager', appTitle)}</h2>
            <p style={{ fontSize: 16, opacity: 0.7 }}>{t('welcomeMessage')}</p>
          </div>
        )}
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} onCreate={s => { setShowCreate(false); setSelected(s.id); }} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
      {showPortalCreate && <PortalCreateModal serverId={selected!} servers={servers} portals={portals} onClose={() => setShowPortalCreate(false)} onCreate={p => { setShowPortalCreate(false); setPortals([...portals, p]); }} />}
      {showPortalEdit && editingPortal && <PortalEditModal portal={editingPortal} servers={servers} onClose={() => { setShowPortalEdit(false); setEditingPortal(null); }} onUpdate={p => { setShowPortalEdit(false); setEditingPortal(null); setPortals(portals.map(x => x.id === p.id ? p : x)); }} />}
    </div>
  );
}

function PropertiesEditor({ serverId, serverStatus }: { serverId: string; serverStatus: string }) {
  const { token, t } = useContext(AuthContext);
  const [props, setProps] = useState<Record<string, string>>({});
  const [memory, setMemory] = useState(2048);
  const [bungeecordPort, setBungeecordPort] = useState(25565);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/servers/${serverId}/properties`, token!),
      api.get(`/api/servers/${serverId}`, token!),
      api.get('/api/bungeecord/port', token!)
    ]).then(([p, server, bcPort]) => { 
      setProps(p || {}); 
      setMemory(server.memory || 2048);
      setBungeecordPort(bcPort.port || 25565);
      setLoading(false); 
    });
  }, [serverId, token]);

  const save = async () => {
    setSaving(true);
    setMsg('');
    await api.put(`/api/servers/${serverId}/memory`, { memory }, token!);
    await api.put('/api/bungeecord/port', { port: bungeecordPort }, token!);
    const res = await api.put(`/api/servers/${serverId}/properties`, props, token!);
    setSaving(false);
    if (res.ok) setMsg(t('saved'));
    else { const data = await res.json(); setMsg(data.error); }
  };

  if (loading) return <div style={{ color: '#888' }}>Loading...</div>;

  const isStopped = serverStatus === 'stopped';

  const selectFields: Record<string, string[]> = {
    gamemode: ['survival', 'creative', 'adventure', 'spectator'],
    difficulty: ['peaceful', 'easy', 'normal', 'hard'],
    'level-type': ['minecraft:normal', 'minecraft:flat', 'minecraft:large_biomes', 'minecraft:amplified'],
    'op-permission-level': ['1', '2', '3', '4'],
    'function-permission-level': ['1', '2', '3', '4'],
  };

  return (
    <div className="properties-editor">
      {!isStopped && <div style={{ color: '#ff9800', marginBottom: 12, padding: 8, background: 'rgba(255,152,0,0.1)', borderRadius: 4 }}>⚠️ {t('stopToEdit')}</div>}
      {msg && <div style={{ color: msg === t('saved') ? '#4caf50' : '#f44336', marginBottom: 12 }}>{msg}</div>}
      
      <div className="property-row" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #333' }}>
        <label>{t('memory')} (MB)</label>
        <input type="number" value={memory} onChange={e => setMemory(+e.target.value)} disabled={!isStopped} />
      </div>
      
      <div className="property-row" style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid #333' }}>
        <label>Port BungeeCord</label>
        <input type="number" value={bungeecordPort} onChange={e => setBungeecordPort(+e.target.value)} />
        <small style={{ color: '#94a3b8', marginTop: 4 }}>Les joueurs se connectent via ce port. Redémarre BungeeCord après modification.</small>
      </div>
      
      <div className="properties-grid">
        {Object.entries(props)
          .filter(([key]) => key !== 'server-port' && key !== 'server-ip')
          .sort(([a], [b]) => {
            if (a === 'level-name') return -1;
            if (b === 'level-name') return 1;
            return a.localeCompare(b);
          })
          .map(([key, value]) => (
          <div key={key} className="property-row">
            <label>{key}</label>
            {selectFields[key] ? (
              <select value={value} onChange={e => setProps({ ...props, [key]: e.target.value })} disabled={!isStopped}>
                {selectFields[key].map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            ) : value === 'true' || value === 'false' ? (
              <select value={value} onChange={e => setProps({ ...props, [key]: e.target.value })} disabled={!isStopped}>
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            ) : (
              <input value={value} onChange={e => setProps({ ...props, [key]: e.target.value })} disabled={!isStopped} />
            )}
          </div>
        ))}
      </div>
      <button className="primary" onClick={save} disabled={!isStopped || saving} style={{ marginTop: 16 }}>{saving ? '...' : t('save')}</button>
    </div>
  );
}

interface BackupConfig {
  enabled: boolean;
  format: 'zip' | 'tar.gz';
  destination: string;
  rotation: number;
  schedule: string;
  scheduleTime: string;
  scheduleDay: number;
}

interface Backup {
  id: string;
  date: string;
  size: number;
  path: string;
}

function BackupsPanel({ serverId }: { serverId: string }) {
  const { token, t } = useContext(AuthContext);
  const [config, setConfig] = useState<BackupConfig>({ enabled: false, format: 'zip', destination: '', rotation: 5, schedule: 'daily', scheduleTime: '03:00', scheduleDay: 0 });
  const [backups, setBackups] = useState<Backup[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.get(`/api/servers/${serverId}/backups/config`, token!),
      api.get(`/api/servers/${serverId}/backups`, token!)
    ]).then(([cfg, list]) => {
      if (cfg && !cfg.error) setConfig(cfg);
      setBackups(list || []);
      setLoading(false);
    });
  }, [serverId, token]);

  const saveConfig = async () => {
    setSaving(true);
    await api.put(`/api/servers/${serverId}/backups/config`, config, token!);
    setSaving(false);
    setMsg(t('saved'));
    setTimeout(() => setMsg(''), 2000);
  };

  const createBackup = async () => {
    setBackingUp(true);
    const res = await api.post(`/api/servers/${serverId}/backups`, {}, token!);
    const data = await res.json();
    if (res.ok && data.backup) setBackups([data.backup, ...backups]);
    setBackingUp(false);
  };

  const browseFolder = async () => {
    try {
      // Modern File System Access API (Chrome/Edge)
      if ('showDirectoryPicker' in window) {
        const dirHandle = await (window as any).showDirectoryPicker();
        setConfig({ ...config, destination: dirHandle.name });
      } else {
        // Fallback: prompt user to enter path
        const path = prompt(t('enterPath'), config.destination || '/home/user/backups');
        if (path) setConfig({ ...config, destination: path });
      }
    } catch (e) {
      // User cancelled or error
    }
  };

  const deleteBackup = async (id: string) => {
    await api.del(`/api/servers/${serverId}/backups/${id}`, token!);
    setBackups(backups.filter(b => b.id !== id));
  };

  if (loading) return <div style={{ color: '#888' }}>Loading...</div>;

  return (
    <div className="backups-panel">
      <h3>{t('backupConfig')}</h3>
      {msg && <div style={{ color: '#4caf50', marginBottom: 8 }}>{msg}</div>}
      
      <div className="backup-config">
        <div className="property-row">
          <label>{t('enabled')}</label>
          <select value={config.enabled ? 'true' : 'false'} onChange={e => setConfig({ ...config, enabled: e.target.value === 'true' })}>
            <option value="true">{t('yes')}</option>
            <option value="false">{t('no')}</option>
          </select>
        </div>
        <div className="property-row">
          <label>{t('format')}</label>
          <select value={config.format} onChange={e => setConfig({ ...config, format: e.target.value as 'zip' | 'tar.gz' })}>
            <option value="zip">ZIP</option>
            <option value="tar.gz">TAR.GZ</option>
          </select>
        </div>
        <div className="property-row">
          <label>{t('schedule')}</label>
          <select value={config.schedule} onChange={e => setConfig({ ...config, schedule: e.target.value })}>
            <option value="hourly">{t('hourly')}</option>
            <option value="daily">{t('daily')}</option>
            <option value="weekly">{t('weekly')}</option>
          </select>
        </div>
        <div className="property-row">
          <label>{t('time')}</label>
          <input type="time" value={config.scheduleTime} onChange={e => setConfig({ ...config, scheduleTime: e.target.value })} />
        </div>
        {config.schedule === 'weekly' && (
          <div className="property-row">
            <label>{t('day')}</label>
            <select value={config.scheduleDay} onChange={e => setConfig({ ...config, scheduleDay: +e.target.value })}>
              <option value="0">{t('sunday')}</option>
              <option value="1">{t('monday')}</option>
              <option value="2">{t('tuesday')}</option>
              <option value="3">{t('wednesday')}</option>
              <option value="4">{t('thursday')}</option>
              <option value="5">{t('friday')}</option>
              <option value="6">{t('saturday')}</option>
            </select>
          </div>
        )}
        <div className="property-row">
          <label>{t('rotation')}</label>
          <input type="number" min="1" value={config.rotation} onChange={e => setConfig({ ...config, rotation: +e.target.value })} />
        </div>
        <div className="property-row" style={{ gridColumn: '1 / -1' }}>
          <label>{t('destination')}</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input value={config.destination} onChange={e => setConfig({ ...config, destination: e.target.value })} placeholder="/path/to/backups or //server/share" style={{ flex: 1 }} />
            <button className="secondary" onClick={browseFolder} style={{ padding: '8px 12px' }}>{t('browse')}</button>
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="primary" onClick={saveConfig} disabled={saving}>{saving ? '...' : t('save')}</button>
        <button className="secondary" onClick={createBackup} disabled={backingUp}>{backingUp ? '...' : t('backupNow')}</button>
      </div>

      <h3 style={{ marginTop: 24 }}>{t('backupList')}</h3>
      {backups.length === 0 ? (
        <div style={{ color: '#888' }}>{t('noBackups')}</div>
      ) : (
        <div className="backup-list">
          {backups.map(b => (
            <div key={b.id} className="backup-item">
              <div>
                <div>{new Date(b.date).toLocaleString()}</div>
                <small style={{ color: '#888' }}>{(b.size / 1024 / 1024).toFixed(1)} MB</small>
              </div>
              <button className="secondary" onClick={() => deleteBackup(b.id)} style={{ padding: '4px 8px' }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LogsPanel({ serverId, serverStatus, logs, logsRef }: { serverId: string; serverStatus: string; logs: string[]; logsRef: React.RefObject<HTMLDivElement> }) {
  const { token, t } = useContext(AuthContext);
  const [cmd, setCmd] = useState('');

  const sendCommand = () => {
    if (!cmd.trim()) return;
    api.post(`/api/servers/${serverId}/command`, { command: cmd }, token!);
    setCmd('');
  };

  return (
    <div>
      <div className="logs" ref={logsRef}>{logs.join('')}</div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <input 
          value={cmd} 
          onChange={e => setCmd(e.target.value)} 
          onKeyDown={e => e.key === 'Enter' && sendCommand()}
          placeholder={t('command')}
          disabled={serverStatus !== 'running'}
          style={{ flex: 1 }}
        />
        <button className="primary" onClick={sendCommand} disabled={serverStatus !== 'running'}>{t('send')}</button>
      </div>
    </div>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const { user, token, setAuth, t, setAppTitle } = useContext(AuthContext);
  const [pwForm, setPwForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [lang, setLang] = useState(user?.lang || 'en');
  const [serverTitle, setServerTitle] = useState(localStorage.getItem('serverTitle') || document.title);
  const [users, setUsers] = useState<{ username: string; role: string }[]>([]);
  const [newUser, setNewUser] = useState({ username: '', password: '', role: 'user' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const savedTitle = localStorage.getItem('serverTitle');
    if (savedTitle) document.title = savedTitle;
  }, []);

  useEffect(() => { if (user?.role === 'admin') api.get('/api/auth/users', token!).then(setUsers); }, [token, user?.role]);

  const save = async () => {
    setError(''); setMsg('');
    if (user?.role === 'admin' && !serverTitle.trim()) {
      setError('Le titre du serveur ne peut pas être vide');
      return;
    }
    if (lang !== user?.lang) {
      await api.put('/api/auth/lang', { lang }, token!);
      setAuth({ ...user!, lang }, token);
      localStorage.setItem('lang', lang);
    }
    if (user?.role === 'admin' && serverTitle !== document.title) {
      document.title = serverTitle;
      localStorage.setItem('serverTitle', serverTitle);
    }
    if (pwForm.newPassword) {
      if (pwForm.newPassword !== pwForm.confirmPassword) { setError(t('passwordMismatch')); return; }
      const res = await api.put('/api/auth/password', { currentPassword: pwForm.currentPassword, newPassword: pwForm.newPassword }, token!);
      if (!res.ok) { setError(t('wrongPassword')); return; }
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    }
    onClose();
  };

  const addUser = async () => {
    if (!newUser.username || !newUser.password) return;
    const res = await api.post('/api/auth/users', newUser, token!);
    if (res.ok) { setUsers([...users, { username: newUser.username, role: newUser.role }]); setNewUser({ username: '', password: '', role: 'user' }); }
    else { const data = await res.json(); setError(data.error); }
  };

  const deleteUser = async (username: string) => {
    await api.del(`/api/auth/users/${username}`, token!);
    setUsers(users.filter(u => u.username !== username));
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{t('settings')}</h2>
        {msg && <div style={{ color: '#4caf50', marginBottom: 8 }}>{msg}</div>}
        {error && <div style={{ color: '#f44336', marginBottom: 8 }}>{error}</div>}
        
        <div style={{ display: 'flex', gap: 16, alignItems: 'end' }}>
          <div className="form-group" style={{ flex: 1 }}>
            <label>{t('language')}</label>
            <select value={lang} onChange={e => setLang(e.target.value)}>
              {languages.map(l => <option key={l.code} value={l.code}>{l.name}</option>)}
            </select>
          </div>

          {user?.role === 'admin' && (
            <div className="form-group" style={{ flex: 1 }}>
              <label>Titre du serveur</label>
              <input 
                value={serverTitle} 
                onChange={e => {
                  const newTitle = e.target.value || 'MineManager';
                  setServerTitle(newTitle);
                  setAppTitle(newTitle);
                  document.title = newTitle;
                  localStorage.setItem('serverTitle', newTitle);
                }} 
                placeholder="MineManager" 
              />
            </div>
          )}
        </div>

        <h3>{t('changePassword')}</h3>
        <div className="form-group"><label>{t('currentPassword')}</label><input type="password" value={pwForm.currentPassword} onChange={e => setPwForm({ ...pwForm, currentPassword: e.target.value })} /></div>
        <div className="form-group"><label>{t('newPassword')}</label><input type="password" value={pwForm.newPassword} onChange={e => setPwForm({ ...pwForm, newPassword: e.target.value })} /></div>
        <div className="form-group"><label>{t('confirmPassword')}</label><input type="password" value={pwForm.confirmPassword} onChange={e => setPwForm({ ...pwForm, confirmPassword: e.target.value })} /></div>

        {user?.role === 'admin' && (
          <>
            <h3>{t('users')}</h3>
            {users.map(u => (
              <div key={u.username} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0' }}>
                <span>{u.role === 'admin' ? '👑' : '👤'} {u.username}</span>
                {u.username !== user?.username && <button className="secondary" onClick={() => deleteUser(u.username)} style={{ padding: '2px 8px' }}>×</button>}
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <input placeholder={t('username')} value={newUser.username} onChange={e => setNewUser({ ...newUser, username: e.target.value })} style={{ flex: 1 }} />
              <input type="password" placeholder={t('password')} value={newUser.password} onChange={e => setNewUser({ ...newUser, password: e.target.value })} style={{ flex: 1 }} />
              <select value={newUser.role} onChange={e => setNewUser({ ...newUser, role: e.target.value })} style={{ width: 80 }}>
                <option value="user">User</option>
                <option value="admin">Admin</option>
              </select>
              <button className="primary" onClick={addUser} style={{ padding: '8px' }}>+</button>
            </div>
          </>
        )}
        
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={onClose}>{t('cancel')}</button>
          <button 
            className="primary" 
            onClick={save}
            disabled={user?.role === 'admin' && !serverTitle.trim()}
          >
            {t('save')}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateModal({ onClose, onCreate }: { onClose: () => void; onCreate: (s: ServerState) => void }) {
  const { token, t } = useContext(AuthContext);
  const [form, setForm] = useState({ name: '', type: 'paper' as ServerType, version: '', port: 25565 });
  const [versions, setVersions] = useState<Record<string, VersionInfo[]>>({});
  const [availableJars, setAvailableJars] = useState<Record<string, string[]>>({});
  const [javaVersions, setJavaVersions] = useState<Record<string, boolean>>({});
  const [usedPorts, setUsedPorts] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.get('/api/versions', token!), api.get('/api/jars', token!), api.get('/api/health', token!), api.get('/api/servers', token!)]).then(([v, jars, health, servers]) => {
      setVersions(v);
      setAvailableJars(jars);
      setJavaVersions(health.javaVersions || {});
      setUsedPorts(servers.map((s: ServerState) => s.port));
      const nextPort = 25565 + servers.length;
      setForm(f => ({ ...f, version: v.paper?.[0]?.version || '', port: nextPort }));
    });
  }, [token]);

  useEffect(() => {
    if (versions[form.type]?.length) setForm(f => ({ ...f, version: versions[form.type][0].version }));
  }, [form.type, versions]);

  const isReady = (type: string, version: string) => availableJars[type]?.includes(version);
  const getVersionInfo = (type: string, version: string) => versions[type]?.find(v => v.version === version);
  const currentVersion = getVersionInfo(form.type, form.version);
  const javaAvailable = currentVersion ? javaVersions[currentVersion.java] : false;
  const portConflict = usedPorts.includes(form.port);

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/servers', form, token!);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreate(data);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{t('create')} {t('servers')}</h2>
        <div style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>✓ = {t('downloaded')}</div>
        {error && <div style={{ color: '#f44336', marginBottom: 12 }}>{error}</div>}
        <div className="form-group"><label>{t('name')}</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} disabled={loading} /></div>
        <div className="form-group"><label>{t('type')}</label><select value={form.type} onChange={e => setForm({ ...form, type: e.target.value as ServerType })} disabled={loading}><option value="paper">Paper</option><option value="purpur">Purpur</option><option value="pufferfish">Pufferfish</option><option value="mohist">Mohist</option><option value="arclight">Arclight</option></select></div>
        <div className="form-group">
          <label>{t('version')}</label>
          <select value={form.version} onChange={e => setForm({ ...form, version: e.target.value })} disabled={loading}>
            {(versions[form.type] || []).map(v => {
              const ready = isReady(form.type, v.version);
              const hasJava = javaVersions[v.java];
              return <option key={v.version} value={v.version} disabled={!hasJava}>{v.version} (Java {v.java}) {ready ? '✓' : ''} {!hasJava ? `⚠️ ${t('javaMissing')}` : ''}</option>;
            })}
          </select>
        </div>
        <div className="form-group">
          <label>{t('port')}</label>
          <input type="number" value={form.port} onChange={e => setForm({ ...form, port: +e.target.value })} disabled={loading} style={portConflict ? { borderColor: '#f44336' } : {}} />
          {portConflict && <div style={{ color: '#f44336', fontSize: 12, marginTop: 4 }}>⚠️ {t('portInUse')}</div>}
        </div>
        
        {!javaAvailable && currentVersion && (
          <div style={{ color: '#f44336', fontSize: 14, marginTop: 8, padding: 8, background: 'rgba(244,67,54,0.1)', borderRadius: 4 }}>
            ⚠️ {t('javaRequired', { v: currentVersion.java })}<br/>
            <a href="https://adoptium.net" target="_blank" rel="noreferrer" style={{ color: '#e94560' }}>{t('downloadJava')}</a>
          </div>
        )}
        
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={onClose} disabled={loading}>{t('cancel')}</button>
          <button className="primary" disabled={!form.name || loading || !javaAvailable || portConflict} onClick={submit}>{loading ? t('creating') : t('create')}</button>
        </div>
      </div>
    </div>
  );
}

function PortalDiagram({ serverId, serverName, portals, servers, onOriginClick, onTargetClick, onPortalDelete }: { 
  serverId: string; 
  serverName: string;
  portals: Portal[]; 
  servers: ServerState[];
  onOriginClick: (portal: Portal) => void;
  onTargetClick: (targetServerId: string) => void;
  onPortalDelete: (portalId: string) => void;
}) {
  const [positions, setPositions] = useState<Record<string, { x: number; y: number }>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [viewBox, setViewBox] = useState({ x: 0, y: 0, width: 800, height: 400 });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const centerX = 400;
    const centerY = 200;
    const radius = 150;
    
    const newPositions: Record<string, { x: number; y: number }> = { [serverId]: { x: centerX, y: centerY } };
    portals.forEach((p, i) => {
      const angle = (i / portals.length) * 2 * Math.PI - Math.PI / 2;
      newPositions[p.id] = {
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius
      };
    });
    setPositions(newPositions);

    // Calculate bounds and center view
    if (portals.length > 0) {
      const allX = Object.values(newPositions).map(p => p.x);
      const allY = Object.values(newPositions).map(p => p.y);
      const minX = Math.min(...allX) - 100;
      const maxX = Math.max(...allX) + 100;
      const minY = Math.min(...allY) - 100;
      const maxY = Math.max(...allY) + 100;
      const width = maxX - minX;
      const height = maxY - minY;
      setViewBox({ x: minX, y: minY, width, height });
    }
  }, [portals, serverId]);

  const handleMouseDown = (id: string, e: React.MouseEvent) => {
    setDragging(id);
    e.preventDefault();
  };

  const getSVGCoordinates = (e: React.MouseEvent) => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const ctm = svg.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    
    const transformed = pt.matrixTransform(ctm.inverse());
    return { x: transformed.x, y: transformed.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return;
    const coords = getSVGCoordinates(e);
    setPositions({
      ...positions,
      [dragging]: coords
    });
  };

  const handleMouseUp = () => setDragging(null);

  if (portals.length === 0) {
    return <div style={{ color: '#888', textAlign: 'center', padding: 32 }}>Aucun portail configuré</div>;
  }

  return (
    <svg 
      ref={svgRef}
      width="100%" 
      height="400" 
      viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
      preserveAspectRatio="xMidYMid meet"
      style={{ border: '1px solid #333', borderRadius: 8, background: '#0f172a' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {portals.map(p => {
        const start = positions[serverId];
        const end = positions[p.id];
        if (!start || !end) return null;
        
        return (
          <g key={p.id}>
            <line
              x1={start.x}
              y1={start.y}
              x2={end.x}
              y2={end.y}
              stroke="#6366f1"
              strokeWidth="2"
              strokeDasharray="5,5"
            />
            <text
              x={(start.x + end.x) / 2}
              y={(start.y + end.y) / 2 - 5}
              fill="#94a3b8"
              fontSize="12"
              textAnchor="middle"
            >
              {p.name}
            </text>
          </g>
        );
      })}

      {portals.map(p => {
        const pos = positions[p.id];
        if (!pos) return null;
        const targetServer = servers.find(s => s.id === p.targetServerId);
        
        return (
          <g 
            key={p.id}
            onMouseDown={(e) => handleMouseDown(p.id, e)}
            onDoubleClick={() => onTargetClick(p.targetServerId)}
            style={{ cursor: 'move' }}
          >
            <rect
              x={pos.x - 60}
              y={pos.y - 25}
              width="120"
              height="50"
              fill="#1e293b"
              stroke="#8b5cf6"
              strokeWidth="2"
              rx="8"
            />
            <text
              x={pos.x}
              y={pos.y + 5}
              fill="#f1f5f9"
              fontSize="14"
              textAnchor="middle"
            >
              {targetServer?.name || 'Unknown'}
            </text>
            <circle
              cx={pos.x + 50}
              cy={pos.y - 20}
              r="10"
              fill="#ef4444"
              stroke="#1e293b"
              strokeWidth="2"
              style={{ cursor: 'pointer' }}
              onClick={(e) => {
                e.stopPropagation();
                onPortalDelete(p.id);
              }}
            />
            <text
              x={pos.x + 50}
              y={pos.y - 16}
              fill="#fff"
              fontSize="12"
              textAnchor="middle"
              style={{ pointerEvents: 'none' }}
            >
              ×
            </text>
          </g>
        );
      })}

      <g
        onMouseDown={(e) => handleMouseDown(serverId, e)}
        style={{ cursor: 'move' }}
      >
        {portals.map(p => (
          <g 
            key={`origin-${p.id}`}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onOriginClick(p);
            }}
            style={{ cursor: 'pointer' }}
          >
            <rect
              x={positions[serverId]?.x - 60}
              y={positions[serverId]?.y - 25}
              width="120"
              height="50"
              fill="#1e293b"
              stroke="#6366f1"
              strokeWidth="2"
              rx="8"
            />
            <text
              x={positions[serverId]?.x}
              y={positions[serverId]?.y + 5}
              fill="#f1f5f9"
              fontSize="14"
              fontWeight="bold"
              textAnchor="middle"
              style={{ pointerEvents: 'none' }}
            >
              {serverName}
            </text>
          </g>
        )).slice(0, 1)}
      </g>
    </svg>
  );
}

function PortalCreateModal({ serverId, servers, portals, onClose, onCreate }: { serverId: string; servers: ServerState[]; portals: Portal[]; onClose: () => void; onCreate: (p: Portal) => void }) {
  const { token, t } = useContext(AuthContext);
  const [form, setForm] = useState({ name: '', targetServerId: '', x: 0, y: 64, z: 0, x2: 5, z2: 5, world: 'world', shape: '' as '' | 'sphere' | 'flat' | 'rectangle' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const usedServerIds = portals.map(p => p.targetServerId);
  const availableServers = servers.filter(s => s.id !== serverId && !usedServerIds.includes(s.id));

  const submit = async () => {
    if (!form.name || !form.targetServerId) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post('/api/portals', { ...form, serverId }, token!);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onCreate(data);
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>🌀 {t('createPortal')}</h2>
        {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>{error}</div>}
        
        <div className="form-group">
          <label>{t('name')}</label>
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="spawn, hub, pvp..." disabled={loading} />
        </div>
        
        <div className="form-group">
          <label>{t('targetServer')}</label>
          <select value={form.targetServerId} onChange={e => setForm({ ...form, targetServerId: e.target.value })} disabled={loading}>
            <option value="">{t('selectServer')}</option>
            {availableServers.map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
          </select>
        </div>
        
        <div className="form-group">
          <label>{t('world')}</label>
          <select value={form.world} onChange={e => setForm({ ...form, world: e.target.value })} disabled={loading}>
            <option value="world">Overworld</option>
            <option value="world_nether">Nether</option>
            <option value="world_the_end">End</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Forme de la zone</label>
          <select value={form.shape} onChange={e => setForm({ ...form, shape: e.target.value as '' | 'sphere' | 'flat' | 'rectangle' })} disabled={loading}>
            <option value="">Sélectionner une forme</option>
            <option value="flat">Plate (cercle 2D)</option>
            <option value="sphere">Sphérique (3D)</option>
            <option value="rectangle">Rectangulaire (2D)</option>
          </select>
        </div>
        
        {form.shape === 'sphere' && (
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, position: 'relative', height: 320 }}>
            <svg width="100%" height="280" viewBox="0 0 300 280">
              <circle cx="150" cy="140" r="80" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <circle cx="150" cy="140" r="4" fill="#ef4444" />
              <line x1="150" y1="140" x2="230" y2="140" stroke="#3b82f6" strokeWidth="1" />
              <text x="190" y="155" fill="#3b82f6" fontSize="12">rayon 3</text>
            </svg>
            <input type="number" value={form.x} onChange={e => setForm({ ...form, x: +e.target.value })} disabled={loading} placeholder="X" style={{ position: 'absolute', left: '35%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.y} onChange={e => setForm({ ...form, y: +e.target.value })} disabled={loading} placeholder="Y" style={{ position: 'absolute', left: '47%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.z} onChange={e => setForm({ ...form, z: +e.target.value })} disabled={loading} placeholder="Z" style={{ position: 'absolute', left: '59%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Sphère 3D - Rayon 3 blocs</div>
          </div>
        )}
        
        {form.shape === 'flat' && (
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, position: 'relative', height: 320 }}>
            <svg width="100%" height="280" viewBox="0 0 300 280">
              <ellipse cx="150" cy="140" rx="80" ry="30" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <circle cx="150" cy="140" r="4" fill="#ef4444" />
              <line x1="150" y1="140" x2="230" y2="140" stroke="#3b82f6" strokeWidth="1" />
              <text x="190" y="155" fill="#3b82f6" fontSize="12">rayon 3</text>
              <line x1="130" y1="140" x2="130" y2="110" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" />
              <line x1="130" y1="140" x2="130" y2="170" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" />
              <text x="110" y="125" fill="#10b981" fontSize="11">±2Y</text>
            </svg>
            <input type="number" value={form.x} onChange={e => setForm({ ...form, x: +e.target.value })} disabled={loading} placeholder="X" style={{ position: 'absolute', left: '35%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.y} onChange={e => setForm({ ...form, y: +e.target.value })} disabled={loading} placeholder="Y" style={{ position: 'absolute', left: '47%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.z} onChange={e => setForm({ ...form, z: +e.target.value })} disabled={loading} placeholder="Z" style={{ position: 'absolute', left: '59%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Cercle 2D - Rayon 3 blocs, ±2 blocs en hauteur</div>
          </div>
        )}
        
        {form.shape === 'rectangle' && (
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, position: 'relative', height: 360 }}>
            <svg width="100%" height="300" viewBox="0 0 300 300">
              {/* Axes */}
              <line x1="20" y1="270" x2="90" y2="270" stroke="#10b981" strokeWidth="2" />
              <polygon points="90,270 85,267 85,273" fill="#10b981" />
              <text x="55" y="285" fill="#10b981" fontSize="13" fontWeight="bold" textAnchor="middle">X →</text>
              <line x1="20" y1="270" x2="20" y2="200" stroke="#10b981" strokeWidth="2" />
              <polygon points="20,200 17,205 23,205" fill="#10b981" />
              <text x="35" y="235" fill="#10b981" fontSize="13" fontWeight="bold">Z ↑</text>
              <text x="150" y="20" fill="#94a3b8" fontSize="13" fontWeight="bold" textAnchor="middle">VUE DU DESSUS (plan horizontal)</text>
              
              {/* Rectangle */}
              <rect x="60" y="80" width="180" height="140" fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <circle cx="60" cy="80" r="4" fill="#ef4444" />
              <circle cx="240" cy="220" r="4" fill="#f59e0b" />
              <line x1="60" y1="150" x2="240" y2="150" stroke="#3b82f6" strokeWidth="1" />
              <text x="150" y="145" fill="#3b82f6" fontSize="11" textAnchor="middle">{Math.abs(form.x2 - form.x)} blocs</text>
              <line x1="150" y1="80" x2="150" y2="220" stroke="#3b82f6" strokeWidth="1" />
              <text x="165" y="155" fill="#3b82f6" fontSize="11">{Math.abs(form.z2 - form.z)} blocs</text>
              <text x="150" y="260" fill="#94a3b8" fontSize="12" textAnchor="middle">Hauteur Y: {form.y} (±2 blocs)</text>
            </svg>
            <span style={{ position: 'absolute', left: '8%', top: '22%', color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>X:</span>
            <input type="number" value={form.x} onChange={e => setForm({ ...form, x: +e.target.value })} disabled={loading} style={{ position: 'absolute', left: '12%', top: '22%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #ef4444', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', left: '8%', top: '32%', color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>Z:</span>
            <input type="number" value={form.z} onChange={e => setForm({ ...form, z: +e.target.value })} disabled={loading} style={{ position: 'absolute', left: '12%', top: '32%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #ef4444', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', right: '18%', bottom: '28%', color: '#f59e0b', fontSize: 11, fontWeight: 'bold' }}>X2:</span>
            <input type="number" value={form.x2} onChange={e => setForm({ ...form, x2: +e.target.value })} disabled={loading} style={{ position: 'absolute', right: '12%', bottom: '28%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #f59e0b', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', right: '18%', bottom: '18%', color: '#f59e0b', fontSize: 11, fontWeight: 'bold' }}>Z2:</span>
            <input type="number" value={form.z2} onChange={e => setForm({ ...form, z2: +e.target.value })} disabled={loading} style={{ position: 'absolute', right: '12%', bottom: '18%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #f59e0b', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', left: '44%', bottom: '8%', color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>Y:</span>
            <input type="number" value={form.y} onChange={e => setForm({ ...form, y: +e.target.value })} disabled={loading} style={{ position: 'absolute', left: '47%', bottom: '8%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #94a3b8', color: '#fff', padding: 4, borderRadius: 4 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Rectangle au sol - Coin 1 (rouge) et Coin 2 (orange)</div>
          </div>
        )}
        
        
        <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>
          💡 {t('portalTip')}
        </div>
        
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={onClose} disabled={loading}>{t('cancel')}</button>
          <button className="primary" disabled={!form.name || !form.targetServerId || loading} onClick={submit}>{loading ? t('creating') : t('create')}</button>
        </div>
      </div>
    </div>
  );
}

function PortalEditModal({ portal, servers, onClose, onUpdate }: { portal: Portal; servers: ServerState[]; onClose: () => void; onUpdate: (p: Portal) => void }) {
  const { token, t } = useContext(AuthContext);
  const [form, setForm] = useState({ targetServerId: portal.targetServerId, x: portal.x, y: portal.y, z: portal.z, x2: portal.x2 || 5, z2: portal.z2 || 5, world: portal.world, shape: (portal.shape || 'flat') as 'sphere' | 'flat' | 'rectangle' });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.put(`/api/portals/${portal.id}`, form, token!);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onUpdate({ ...portal, ...form });
    } catch (e: any) {
      setError(e.message);
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>⚙️ Paramétrage du portail</h2>
        {error && <div style={{ color: '#ef4444', marginBottom: 12 }}>{error}</div>}
        
        <div className="form-group">
          <label>{t('name')}</label>
          <input value={portal.name} disabled style={{ opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        
        <div className="form-group">
          <label>{t('targetServer')}</label>
          <select value={form.targetServerId} onChange={e => setForm({ ...form, targetServerId: e.target.value })} disabled={loading}>
            {servers.filter(s => s.id !== portal.serverId).map(s => <option key={s.id} value={s.id}>{s.name} ({s.type})</option>)}
          </select>
        </div>
        
        <div className="form-group">
          <label>{t('world')}</label>
          <select value={form.world} onChange={e => setForm({ ...form, world: e.target.value })} disabled={loading}>
            <option value="world">Overworld</option>
            <option value="world_nether">Nether</option>
            <option value="world_the_end">End</option>
          </select>
        </div>
        
        <div className="form-group">
          <label>Forme de la zone</label>
          <select value={form.shape} onChange={e => setForm({ ...form, shape: e.target.value as 'sphere' | 'flat' | 'rectangle' })} disabled={loading}>
            <option value="flat">Plate (cercle 2D)</option>
            <option value="sphere">Sphérique (3D)</option>
            <option value="rectangle">Rectangulaire (2D)</option>
          </select>
        </div>
        
        {form.shape === 'sphere' && (
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, position: 'relative', height: 320 }}>
            <svg width="100%" height="280" viewBox="0 0 300 280">
              <circle cx="150" cy="140" r="80" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <circle cx="150" cy="140" r="4" fill="#ef4444" />
              <line x1="150" y1="140" x2="230" y2="140" stroke="#3b82f6" strokeWidth="1" />
              <text x="190" y="155" fill="#3b82f6" fontSize="12">rayon 3</text>
            </svg>
            <input type="number" value={form.x} onChange={e => setForm({ ...form, x: +e.target.value })} disabled={loading} placeholder="X" style={{ position: 'absolute', left: '35%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.y} onChange={e => setForm({ ...form, y: +e.target.value })} disabled={loading} placeholder="Y" style={{ position: 'absolute', left: '47%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.z} onChange={e => setForm({ ...form, z: +e.target.value })} disabled={loading} placeholder="Z" style={{ position: 'absolute', left: '59%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Sphère 3D - Rayon 3 blocs</div>
          </div>
        )}
        
        {form.shape === 'flat' && (
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, position: 'relative', height: 320 }}>
            <svg width="100%" height="280" viewBox="0 0 300 280">
              <ellipse cx="150" cy="140" rx="80" ry="30" fill="none" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <circle cx="150" cy="140" r="4" fill="#ef4444" />
              <line x1="150" y1="140" x2="230" y2="140" stroke="#3b82f6" strokeWidth="1" />
              <text x="190" y="155" fill="#3b82f6" fontSize="12">rayon 3</text>
              <line x1="130" y1="140" x2="130" y2="110" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" />
              <line x1="130" y1="140" x2="130" y2="170" stroke="#10b981" strokeWidth="1" strokeDasharray="2,2" />
              <text x="110" y="125" fill="#10b981" fontSize="11">±2Y</text>
            </svg>
            <input type="number" value={form.x} onChange={e => setForm({ ...form, x: +e.target.value })} disabled={loading} placeholder="X" style={{ position: 'absolute', left: '35%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.y} onChange={e => setForm({ ...form, y: +e.target.value })} disabled={loading} placeholder="Y" style={{ position: 'absolute', left: '47%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <input type="number" value={form.z} onChange={e => setForm({ ...form, z: +e.target.value })} disabled={loading} placeholder="Z" style={{ position: 'absolute', left: '59%', top: '45%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #3b82f6', color: '#fff', padding: 4, borderRadius: 4 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Cercle 2D - Rayon 3 blocs, ±2 blocs en hauteur</div>
          </div>
        )}
        
        {form.shape === 'rectangle' && (
          <div style={{ background: '#1e293b', padding: 24, borderRadius: 8, position: 'relative', height: 360 }}>
            <svg width="100%" height="300" viewBox="0 0 300 300">
              {/* Axes */}
              <line x1="20" y1="270" x2="90" y2="270" stroke="#10b981" strokeWidth="2" />
              <polygon points="90,270 85,267 85,273" fill="#10b981" />
              <text x="55" y="285" fill="#10b981" fontSize="13" fontWeight="bold" textAnchor="middle">X →</text>
              <line x1="20" y1="270" x2="20" y2="200" stroke="#10b981" strokeWidth="2" />
              <polygon points="20,200 17,205 23,205" fill="#10b981" />
              <text x="35" y="235" fill="#10b981" fontSize="13" fontWeight="bold">Z ↑</text>
              <text x="150" y="20" fill="#94a3b8" fontSize="13" fontWeight="bold" textAnchor="middle">VUE DU DESSUS (plan horizontal)</text>
              
              {/* Rectangle */}
              <rect x="60" y="80" width="180" height="140" fill="rgba(59, 130, 246, 0.1)" stroke="#3b82f6" strokeWidth="2" strokeDasharray="5,5" />
              <circle cx="60" cy="80" r="4" fill="#ef4444" />
              <circle cx="240" cy="220" r="4" fill="#f59e0b" />
              <line x1="60" y1="150" x2="240" y2="150" stroke="#3b82f6" strokeWidth="1" />
              <text x="150" y="145" fill="#3b82f6" fontSize="11" textAnchor="middle">{Math.abs(form.x2 - form.x)} blocs</text>
              <line x1="150" y1="80" x2="150" y2="220" stroke="#3b82f6" strokeWidth="1" />
              <text x="165" y="155" fill="#3b82f6" fontSize="11">{Math.abs(form.z2 - form.z)} blocs</text>
              <text x="150" y="260" fill="#94a3b8" fontSize="12" textAnchor="middle">Hauteur Y: {form.y} (±2 blocs)</text>
            </svg>
            <span style={{ position: 'absolute', left: '8%', top: '22%', color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>X:</span>
            <input type="number" value={form.x} onChange={e => setForm({ ...form, x: +e.target.value })} disabled={loading} style={{ position: 'absolute', left: '12%', top: '22%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #ef4444', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', left: '8%', top: '32%', color: '#ef4444', fontSize: 11, fontWeight: 'bold' }}>Z:</span>
            <input type="number" value={form.z} onChange={e => setForm({ ...form, z: +e.target.value })} disabled={loading} style={{ position: 'absolute', left: '12%', top: '32%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #ef4444', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', right: '18%', bottom: '28%', color: '#f59e0b', fontSize: 11, fontWeight: 'bold' }}>X2:</span>
            <input type="number" value={form.x2} onChange={e => setForm({ ...form, x2: +e.target.value })} disabled={loading} style={{ position: 'absolute', right: '12%', bottom: '28%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #f59e0b', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', right: '18%', bottom: '18%', color: '#f59e0b', fontSize: 11, fontWeight: 'bold' }}>Z2:</span>
            <input type="number" value={form.z2} onChange={e => setForm({ ...form, z2: +e.target.value })} disabled={loading} style={{ position: 'absolute', right: '12%', bottom: '18%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #f59e0b', color: '#fff', padding: 4, borderRadius: 4 }} />
            <span style={{ position: 'absolute', left: '44%', bottom: '8%', color: '#94a3b8', fontSize: 11, fontWeight: 'bold' }}>Y:</span>
            <input type="number" value={form.y} onChange={e => setForm({ ...form, y: +e.target.value })} disabled={loading} style={{ position: 'absolute', left: '47%', bottom: '8%', width: 50, textAlign: 'center', background: '#0f172a', border: '1px solid #94a3b8', color: '#fff', padding: 4, borderRadius: 4 }} />
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, textAlign: 'center' }}>Rectangle 2D - Entre deux coins, ±2 blocs en hauteur</div>
          </div>
        )}
        
        
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button className="secondary" onClick={onClose} disabled={loading}>{t('cancel')}</button>
          <button className="primary" disabled={loading} onClick={submit}>{loading ? '...' : t('save')}</button>
        </div>
      </div>
    </div>
  );
}

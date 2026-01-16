import { spawn, ChildProcess, execSync } from 'child_process';
import { v4 as uuid } from 'uuid';
import { Server } from 'socket.io';
import { ServerConfig, ServerState, ServerMetrics, Portal } from './types.js';
import { ServerDownloader } from './downloader.js';
import * as fs from 'fs';
import * as path from 'path';

interface BackupConfig {
  enabled: boolean;
  format: 'zip' | 'tar.gz';
  destination: string;
  rotation: number;
  schedule: string;
  scheduleTime: string; // HH:MM
  scheduleDay: number;  // 0-6 for weekly (0=Sunday)
}

interface Backup {
  id: string;
  date: string;
  size: number;
  path: string;
}

export class ServerManager {
  private servers = new Map<string, ServerState>();
  private processes = new Map<string, ChildProcess>();
  private portals = new Map<string, Portal>();
  private logs = new Map<string, string[]>();
  private backupConfigs = new Map<string, BackupConfig>();
  private backups = new Map<string, Backup[]>();
  private downloader = new ServerDownloader();
  private io: Server;
  private baseDir = path.join(process.cwd(), 'servers');
  private dataFile = path.join(process.cwd(), 'servers', 'data.json');
  private javaPath: string;
  private tpsTimers = new Map<string, NodeJS.Timeout>();
  private bungeecordProcess: ChildProcess | null = null;
  private bungeecordPort: number = 25565;

  constructor(io: Server) {
    this.io = io;
    this.javaPath = this.findJava();
    console.log('Using Java:', this.javaPath);
    fs.mkdirSync(path.join(this.baseDir, 'instances'), { recursive: true });
    fs.mkdirSync(path.join(this.baseDir, 'backups'), { recursive: true });
    fs.mkdirSync(path.join(this.baseDir, 'jars'), { recursive: true });
    this.cleanupOrphanedProcesses();
    this.loadData();
    this.startScheduler();
    this.updateBungeeCordConfig();
    this.startBungeeCord();
  }

  private cleanupOrphanedProcesses(): void {
    try {
      // Kill any orphaned Minecraft server processes
      execSync('pkill -f "java.*server.jar.*nogui"', { stdio: 'pipe' });
      console.log('Cleaned up orphaned server processes');
    } catch (e) {
      // No processes to kill or error - ignore
    }
  }

  private findJava(): string {
    return '/usr/bin/java';
  }

  private startScheduler(): void {
    // Check every minute for scheduled backups
    setInterval(() => {
      const now = new Date();
      for (const [id, config] of this.backupConfigs) {
        if (!config.enabled) continue;
        const [hour, minute] = (config.scheduleTime || '03:00').split(':').map(Number);
        if (now.getMinutes() !== minute || now.getHours() !== hour) continue;
        
        if (config.schedule === 'hourly' && now.getMinutes() === minute) {
          this.createBackup(id).catch(e => console.error(`Backup failed for ${id}:`, e));
        } else if (config.schedule === 'daily' && now.getHours() === hour && now.getMinutes() === minute) {
          this.createBackup(id).catch(e => console.error(`Backup failed for ${id}:`, e));
        } else if (config.schedule === 'weekly' && now.getDay() === (config.scheduleDay || 0) && now.getHours() === hour && now.getMinutes() === minute) {
          this.createBackup(id).catch(e => console.error(`Backup failed for ${id}:`, e));
        }
      }
    }, 60000);
  }

  private loadData(): void {
    if (!fs.existsSync(this.dataFile)) return;
    try {
      const data = JSON.parse(fs.readFileSync(this.dataFile, 'utf-8'));
      for (const s of data.servers || []) {
        s.status = 'stopped';
        s.players = [];
        this.servers.set(s.id, s);
        this.logs.set(s.id, []);
      }
      for (const [id, cfg] of Object.entries(data.backupConfigs || {})) {
        this.backupConfigs.set(id, cfg as BackupConfig);
      }
      for (const [id, list] of Object.entries(data.backups || {})) {
        this.backups.set(id, list as Backup[]);
      }
      this.bungeecordPort = data.bungeecordPort || 25565;
    } catch (e) { console.error('Failed to load data:', e); }
  }

  private saveData(): void {
    const data = {
      servers: Array.from(this.servers.values()).map(s => ({ id: s.id, name: s.name, type: s.type, version: s.version, port: s.port, memory: s.memory })),
      backupConfigs: Object.fromEntries(this.backupConfigs),
      backups: Object.fromEntries(this.backups),
      bungeecordPort: this.bungeecordPort,
    };
    fs.writeFileSync(this.dataFile, JSON.stringify(data, null, 2));
  }

  private isPortInUse(port: number): boolean {
    // Check in memory
    if (Array.from(this.servers.values()).some(s => s.port === port)) return true;
    // Check system
    try {
      execSync(`ss -tuln | grep -q ':${port} '`, { stdio: 'pipe' });
      return true;
    } catch {
      return false;
    }
  }

  async createServer(config: Omit<ServerConfig, 'id' | 'memory'> & { memory?: number }): Promise<ServerState> {
    // Find next available port if conflict
    let port = config.port;
    while (this.isPortInUse(port)) {
      port++;
    }
    
    const id = uuid();
    const serverDir = path.join(this.baseDir, 'instances', id);
    fs.mkdirSync(serverDir, { recursive: true });

    const jarPath = await this.downloader.getJar(config.type, config.version, (progress, message) => {
      this.io.of('/dashboard').emit('buildProgress', { type: config.type, version: config.version, progress, message });
    });
    fs.copyFileSync(jarPath, path.join(serverDir, 'server.jar'));
    fs.writeFileSync(path.join(serverDir, 'eula.txt'), 'eula=true');
    
    // Create complete server.properties template
    const serverProps = `#Minecraft server properties
server-port=${port}
online-mode=false
gamemode=survival
difficulty=easy
max-players=20
motd=A Minecraft Server
level-name=world
level-type=minecraft\\:normal
spawn-protection=16
allow-nether=true
allow-flight=false
view-distance=10
simulation-distance=10
enable-command-block=false
hardcore=false
pvp=true
generate-structures=true
spawn-monsters=true
spawn-animals=true
spawn-npcs=true
force-gamemode=false
white-list=false
broadcast-console-to-ops=true
op-permission-level=4
function-permission-level=2
resource-pack=
resource-pack-prompt=
resource-pack-sha1=
require-resource-pack=false
enable-jmx-monitoring=false
sync-chunk-writes=true
enable-status=true
hide-online-players=false
max-world-size=29999984
network-compression-threshold=256
max-tick-time=60000
use-native-transport=true
enable-rcon=false
rcon.port=25575
rcon.password=
query.port=25565
enable-query=false
generator-settings={}
level-seed=
enforce-whitelist=false
rate-limit=0
max-chained-neighbor-updates=1000000
`;
    fs.writeFileSync(path.join(serverDir, 'server.properties'), serverProps);

    // Setup shared plugins
    this.setupSharedPlugins(id, serverDir);

    const state: ServerState = { id, name: config.name, type: config.type, version: config.version, port, memory: config.memory || 2048, status: 'stopped', players: [], tps: 20, usedMemory: 0 };
    this.servers.set(id, state);
    this.logs.set(id, []);
    this.saveData();
    this.updateBungeeCordConfig();
    this.restartBungeeCord();
    this.emitUpdate();
    return state;
  }

  private setupSharedPlugins(serverId: string, serverDir: string): void {
    const pluginsDir = path.join(serverDir, 'plugins');
    fs.mkdirSync(pluginsDir, { recursive: true });
    
    const sharedPluginsDir = path.join(this.baseDir, 'shared-plugins');
    fs.mkdirSync(sharedPluginsDir, { recursive: true });
    
    // Create symlink for MineManagerPlugin
    const pluginJar = path.join(sharedPluginsDir, 'MineManagerPlugin-1.0.0.jar');
    const pluginLink = path.join(pluginsDir, 'MineManagerPlugin-1.0.0.jar');
    
    if (fs.existsSync(pluginJar) && !fs.existsSync(pluginLink)) {
      try {
        fs.symlinkSync(pluginJar, pluginLink);
      } catch (e) {
        // If symlink fails, copy instead
        fs.copyFileSync(pluginJar, pluginLink);
      }
    }
    
    // Create plugin config
    const configDir = path.join(pluginsDir, 'MineManagerPlugin');
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, 'config.yml'), `server-id: "${serverId}"\nmanager-url: "http://localhost:3000"\n`);
  }

  async startServer(id: string): Promise<void> {
    const server = this.servers.get(id);
    if (!server || server.status !== 'stopped') return;

    // Check if process already exists
    if (this.processes.has(id)) {
      console.log('Server already has a process, skipping start');
      return;
    }

    server.status = 'starting';
    this.emitUpdate();

    const serverDir = path.join(this.baseDir, 'instances', id);
    
    // Clean up any existing lock files
    const lockFile = path.join(serverDir, 'world', 'session.lock');
    if (fs.existsSync(lockFile)) {
      try { fs.unlinkSync(lockFile); } catch (e) { console.error('Failed to remove lock:', e); }
    }
    
    console.log('Starting server:', { id, javaPath: this.javaPath, serverDir, exists: fs.existsSync(this.javaPath) });
    
    const proc = spawn(this.javaPath, [
      `-Xmx${server.memory}M`, 
      `-Xms${server.memory}M`, 
      '-jar', 
      'server.jar', 
      'nogui'
    ], { 
      cwd: serverDir
    });

    proc.stdout?.on('data', (data) => {
      const line = data.toString();
      this.addLog(id, line);
      
      // Detect server ready
      if (line.includes('Done (') && line.includes('s)!')) {
        server.status = 'running';
        this.startTPSMonitoring(id);
        this.emitUpdate();
      }
      
      // Detect player join
      const joinMatch = line.match(/(\w+)\[.*?\] logged in/i) || line.match(/(\w+) joined the game/i);
      if (joinMatch && joinMatch[1]) {
        const playerName = joinMatch[1];
        if (!server.players.includes(playerName)) {
          server.players.push(playerName);
          this.emitUpdate();
        }
      }
      
      // Detect player leave
      const leaveMatch = line.match(/(\w+) lost connection/i) || line.match(/(\w+) left the game/i);
      if (leaveMatch && leaveMatch[1]) {
        const playerName = leaveMatch[1];
        server.players = server.players.filter(p => p !== playerName);
        this.emitUpdate();
      }
      
      // Detect lag warnings - multiple patterns
      const lagMatch = line.match(/running (\d+)ms behind/i) || 
                       line.match(/Can't keep up.*?(\d+)ms behind/i) ||
                       line.match(/(\d+)ms behind.*?ticks/i);
      if (lagMatch && lagMatch[1]) {
        const msBehind = parseInt(lagMatch[1]);
        const tickTime = 50 + (msBehind / 20);
        server.tps = Math.max(1, Math.min(20, 1000 / tickTime));
        this.emitUpdate();
      }
      
      // Detect TPS from plugins (Spark, Essentials, etc.)
      const tpsMatch = line.match(/TPS.*?(\d+\.?\d*)/i);
      if (tpsMatch && tpsMatch[1]) {
        server.tps = parseFloat(tpsMatch[1]);
        this.emitUpdate();
      }
      
      // Detect memory usage - multiple patterns
      const memMatch = line.match(/Memory.*?(\d+)\/(\d+)\s*MB/i) ||
                       line.match(/Mem:\s*(\d+)\/(\d+)/i) ||
                       line.match(/Used memory:\s*(\d+)/i);
      if (memMatch) {
        if (memMatch[2]) {
          server.usedMemory = parseInt(memMatch[1]);
        } else if (memMatch[1]) {
          server.usedMemory = parseInt(memMatch[1]);
        }
        this.emitUpdate();
      }
    });
    
    proc.stderr?.on('data', (data) => this.addLog(id, data.toString()));

    proc.on('exit', (code) => {
      if (server.status === 'starting') {
        this.addLog(id, `Server failed to start (exit code: ${code})`);
      }
      server.status = 'stopped';
      server.players = [];
      server.tps = 20;
      server.usedMemory = 0;
      this.processes.delete(id);
      this.stopTPSMonitoring(id);
      this.emitUpdate();
    });

    proc.on('error', (err) => {
      this.addLog(id, `Process error: ${err.message}`);
      server.status = 'stopped';
      this.processes.delete(id);
      this.emitUpdate();
    });

    this.processes.set(id, proc);
  }

  stopServer(id: string): void {
    const server = this.servers.get(id);
    const proc = this.processes.get(id);
    if (!server || !proc || server.status !== 'running') return;

    server.status = 'stopping';
    this.stopTPSMonitoring(id);
    this.emitUpdate();
    proc.stdin?.write('stop\n');
    
    // Clean up lock files after stop
    setTimeout(() => {
      const serverDir = path.join(this.baseDir, 'instances', id);
      const lockFile = path.join(serverDir, 'world', 'session.lock');
      if (fs.existsSync(lockFile)) {
        try { fs.unlinkSync(lockFile); } catch (e) { console.error('Failed to remove lock:', e); }
      }
    }, 5000);
  }

  private startTPSMonitoring(id: string): void {
    this.stopTPSMonitoring(id);
    const server = this.servers.get(id);
    const proc = this.processes.get(id);
    if (!server || !proc) return;
    
    // Reset to 20 TPS
    server.tps = 20;
    
    const timer = setInterval(() => {
      if (server.status === 'running' && proc.pid) {
        // Get memory usage from process
        try {
          const memInfo = execSync(`ps -p ${proc.pid} -o rss=`, { encoding: 'utf-8' }).trim();
          if (memInfo) {
            server.usedMemory = Math.round(parseInt(memInfo) / 1024); // Convert KB to MB
            this.emitUpdate();
          }
        } catch (e) {
          // Process might have ended
        }
        
        // If no lag detected, gradually return to 20 TPS
        if (server.tps < 20) {
          server.tps = Math.min(20, server.tps + 0.5);
          this.emitUpdate();
        }
      }
    }, 2000); // Check every 2 seconds
    
    this.tpsTimers.set(id, timer);
  }

  private stopTPSMonitoring(id: string): void {
    const timer = this.tpsTimers.get(id);
    if (timer) {
      clearInterval(timer);
      this.tpsTimers.delete(id);
    }
  }

  deleteServer(id: string): void {
    this.stopServer(id);
    this.servers.delete(id);
    this.logs.delete(id);
    this.backupConfigs.delete(id);
    this.backups.delete(id);
    const serverDir = path.join(this.baseDir, 'instances', id);
    fs.rmSync(serverDir, { recursive: true, force: true });
    this.saveData();
    this.updateBungeeCordConfig();
    this.restartBungeeCord();
    this.emitUpdate();
  }

  updateMetrics(metrics: ServerMetrics): void {
    const server = this.servers.get(metrics.serverId);
    if (server) {
      server.tps = metrics.tps;
      server.players = metrics.players;
      server.usedMemory = metrics.usedMemory;
      this.emitUpdate();
    }
  }

  createPortal(portal: Omit<Portal, 'id'>): Portal {
    const id = uuid();
    const p = { id, ...portal };
    this.portals.set(id, p);
    return p;
  }

  updatePortal(id: string, updates: Partial<Omit<Portal, 'id' | 'serverId' | 'name'>>): Portal | null {
    const portal = this.portals.get(id);
    if (!portal) return null;
    const updated = { ...portal, ...updates };
    this.portals.set(id, updated);
    return updated;
  }

  deletePortal(id: string): void {
    this.portals.delete(id);
  }

  getPortals(serverId?: string): Portal[] {
    const all = Array.from(this.portals.values());
    const filtered = serverId ? all.filter(p => p.serverId === serverId) : all;
    
    // Add target server name to each portal
    return filtered.map(p => {
      const targetServer = this.servers.get(p.targetServerId);
      return {
        ...p,
        targetServerName: targetServer?.name || 'Unknown'
      };
    });
  }

  getServer(id: string): ServerState | undefined {
    return this.servers.get(id);
  }

  getAllServers(): ServerState[] {
    const serverIp = execSync('hostname -I 2>/dev/null || echo "127.0.0.1"', { encoding: 'utf-8' }).trim().split(' ')[0];
    return Array.from(this.servers.values()).map(s => ({ ...s, serverIp, bungeecordPort: this.bungeecordPort }));
  }

  getBungeeCordPort(): number {
    return this.bungeecordPort;
  }

  setBungeeCordPort(port: number): void {
    this.bungeecordPort = port;
    this.saveData();
    this.updateBungeeCordConfig();
    this.restartBungeeCord();
  }

  updatePlayerPositions(serverId: string, positions: any[]): void {
    const server = this.servers.get(serverId);
    if (server) {
      server.playerPositions = positions;
      this.io.emit('servers', Array.from(this.servers.values()));
    }
  }

  getLogs(id: string): string[] {
    return this.logs.get(id) || [];
  }

  getAvailableJars(): Record<string, string[]> {
    return this.downloader.getAvailableJars();
  }

  sendCommand(id: string, command: string): void {
    const proc = this.processes.get(id);
    proc?.stdin?.write(command + '\n');
  }

  getServerProperties(id: string): Record<string, string> | null {
    const propsPath = path.join(this.baseDir, 'instances', id, 'server.properties');
    if (!fs.existsSync(propsPath)) return null;
    const content = fs.readFileSync(propsPath, 'utf-8');
    const props: Record<string, string> = {};
    for (const line of content.split('\n')) {
      if (line && !line.startsWith('#')) {
        const [key, ...rest] = line.split('=');
        if (key) props[key.trim()] = rest.join('=').trim();
      }
    }
    return props;
  }

  setServerProperties(id: string, props: Record<string, string>): void {
    const server = this.servers.get(id);
    if (!server) throw new Error('Server not found');
    if (server.status !== 'stopped') throw new Error('Stop server before editing properties');
    const propsPath = path.join(this.baseDir, 'instances', id, 'server.properties');
    const content = Object.entries(props).map(([k, v]) => `${k}=${v}`).join('\n');
    fs.writeFileSync(propsPath, content);
  }

  setServerMemory(id: string, memory: number): void {
    const server = this.servers.get(id);
    if (!server) throw new Error('Server not found');
    if (server.status !== 'stopped') throw new Error('Stop server before editing memory');
    server.memory = memory;
    this.saveData();
    this.emitUpdate();
  }

  // Backup methods
  getBackupConfig(id: string): BackupConfig {
    return this.backupConfigs.get(id) || { enabled: false, format: 'zip', destination: '', rotation: 5, schedule: 'daily', scheduleTime: '03:00', scheduleDay: 0 };
  }

  setBackupConfig(id: string, config: BackupConfig): void {
    this.backupConfigs.set(id, config);
    this.saveData();
  }

  getBackups(id: string): Backup[] {
    return this.backups.get(id) || [];
  }

  async createBackup(id: string): Promise<Backup> {
    const server = this.servers.get(id);
    if (!server) throw new Error('Server not found');
    
    const config = this.getBackupConfig(id);
    const serverDir = path.join(this.baseDir, 'instances', id);
    const backupId = uuid();
    const date = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${server.name}-${date}.${config.format || 'zip'}`;
    
    const destDir = config.destination || path.join(this.baseDir, 'backups', id);
    fs.mkdirSync(destDir, { recursive: true });
    const backupPath = path.join(destDir, filename);

    // Create archive
    const worldDirs = ['world', 'world_nether', 'world_the_end'].filter(w => fs.existsSync(path.join(serverDir, w)));
    if (worldDirs.length === 0) throw new Error('No worlds to backup');

    if (config.format === 'tar.gz') {
      execSync(`tar -czf "${backupPath}" ${worldDirs.join(' ')}`, { cwd: serverDir });
    } else {
      execSync(`zip -r "${backupPath}" ${worldDirs.join(' ')}`, { cwd: serverDir });
    }

    const stats = fs.statSync(backupPath);
    const backup: Backup = { id: backupId, date: new Date().toISOString(), size: stats.size, path: backupPath };
    
    const backupList = this.backups.get(id) || [];
    backupList.unshift(backup);
    
    // Apply rotation
    while (backupList.length > config.rotation) {
      const old = backupList.pop();
      if (old && fs.existsSync(old.path)) fs.unlinkSync(old.path);
    }
    
    this.backups.set(id, backupList);
    this.saveData();
    return backup;
  }

  deleteBackup(serverId: string, backupId: string): void {
    const backupList = this.backups.get(serverId) || [];
    const backup = backupList.find(b => b.id === backupId);
    if (backup && fs.existsSync(backup.path)) fs.unlinkSync(backup.path);
    this.backups.set(serverId, backupList.filter(b => b.id !== backupId));
    this.saveData();
  }

  private addLog(id: string, line: string): void {
    const logs = this.logs.get(id);
    if (logs) {
      logs.push(line);
      if (logs.length > 500) logs.shift();
      this.io.of('/dashboard').emit('log', { serverId: id, line });
    }
  }

  private emitUpdate(): void {
    this.io.of('/dashboard').emit('servers', this.getAllServers());
  }

  private updateBungeeCordConfig(): void {
    const bungeecordDir = path.join(this.baseDir, 'bungeecord');
    const configPath = path.join(bungeecordDir, 'config.yml');
    
    if (!fs.existsSync(bungeecordDir)) return;
    
    const servers = Array.from(this.servers.values());
    const serverList = servers.map(s => `  ${s.name}:\n    motd: '${s.name}'\n    address: localhost:${s.port}\n    restricted: false`).join('\n');
    const firstServer = servers.length > 0 ? servers[0].name : 'lobby';
    
    const config = `listeners:
- query_port: 25577
  motd: '&6MineManager Network'
  priorities:
  - ${firstServer}
  bind_local_address: true
  host: 0.0.0.0:${this.bungeecordPort}
  max_players: 100
  tab_size: 60
  force_default_server: false
  forced_hosts: {}
remote_ping_cache: -1
network_compression_threshold: 256
permissions: {}
timeout: 30000
log_pings: true
player_limit: -1
ip_forward: true
online_mode: false
remote_ping_timeout: 5000
servers:
${serverList}
`;
    
    fs.writeFileSync(configPath, config);
  }

  private startBungeeCord(): void {
    const bungeecordDir = path.join(this.baseDir, 'bungeecord');
    const jarPath = path.join(bungeecordDir, 'BungeeCord.jar');
    
    if (!fs.existsSync(jarPath)) {
      console.log('BungeeCord not found, skipping proxy start');
      return;
    }
    
    console.log('Starting BungeeCord proxy...');
    this.bungeecordProcess = spawn(this.javaPath, ['-Xmx512M', '-jar', 'BungeeCord.jar'], { cwd: bungeecordDir });
    
    this.bungeecordProcess.stdout?.on('data', (data) => {
      console.log('[BungeeCord]', data.toString().trim());
    });
    
    this.bungeecordProcess.stderr?.on('data', (data) => {
      console.error('[BungeeCord]', data.toString().trim());
    });
    
    this.bungeecordProcess.on('exit', (code) => {
      console.log('BungeeCord exited with code', code);
      this.bungeecordProcess = null;
    });
  }

  private restartBungeeCord(): void {
    if (this.bungeecordProcess) {
      this.bungeecordProcess.kill();
      setTimeout(() => this.startBungeeCord(), 2000);
    } else {
      this.startBungeeCord();
    }
  }
}

import { Express } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { ServerManager } from './serverManager.js';
import { ProcessManager } from './processManager.js';
import { ServerType } from './types.js';
import { authMiddleware } from './auth.js';

const VERSIONS: Record<string, { version: string; java: string }[]> = {
  paper: [
    { version: '1.21.4', java: '21' }, { version: '1.21.3', java: '21' }, { version: '1.21.1', java: '21' },
    { version: '1.20.6', java: '21' }, { version: '1.20.4', java: '17' }, { version: '1.20.1', java: '17' },
  ],
  purpur: [
    { version: '1.21.4', java: '21' }, { version: '1.21.3', java: '21' }, { version: '1.21.1', java: '21' },
    { version: '1.20.6', java: '21' }, { version: '1.20.4', java: '17' }, { version: '1.20.1', java: '17' },
  ],
  pufferfish: [
    { version: '1.21', java: '21' }, { version: '1.20', java: '17' },
  ],
  mohist: [
    { version: '1.20.2', java: '17' }, { version: '1.20.1', java: '17' }, { version: '1.19.4', java: '17' },
    { version: '1.19.2', java: '17' }, { version: '1.18.2', java: '17' }, { version: '1.16.5', java: '8' },
    { version: '1.12.2', java: '8' },
  ],
  arclight: [
    { version: '1.21.1', java: '21' }, { version: '1.20.6', java: '21' }, { version: '1.20.4', java: '17' },
  ],
};

export function setupRoutes(app: Express, manager: ServerManager, processManager: ProcessManager): void {
  app.get('/api/health', (_, res) => {
    const javaVersions: Record<string, boolean> = {};
    
    // Get all available Java installations
    const jvmDir = '/usr/lib/jvm';
    let availableJavas: string[] = [];
    try {
      if (fs.existsSync(jvmDir)) {
        availableJavas = fs.readdirSync(jvmDir).filter(dir => 
          fs.statSync(path.join(jvmDir, dir)).isDirectory()
        );
      }
    } catch (e) {
      console.log('Could not read JVM directory:', e);
    }
    
    // Check Java 8
    const java8Dirs = availableJavas.filter(dir => 
      dir.includes('java-8') || dir.includes('jdk-8') || dir.includes('openjdk-8') || dir.includes('jdk1.8')
    );
    javaVersions['8'] = java8Dirs.some(dir => 
      fs.existsSync(path.join(jvmDir, dir, 'bin', 'java'))
    );
    
    // Check Java 17
    const java17Dirs = availableJavas.filter(dir => 
      dir.includes('java-17') || dir.includes('jdk-17') || dir.includes('openjdk-17')
    );
    javaVersions['17'] = java17Dirs.some(dir => 
      fs.existsSync(path.join(jvmDir, dir, 'bin', 'java'))
    );
    
    // Check Java 21
    const java21Dirs = availableJavas.filter(dir => 
      dir.includes('java-21') || dir.includes('jdk-21') || dir.includes('openjdk-21')
    );
    javaVersions['21'] = java21Dirs.some(dir => 
      fs.existsSync(path.join(jvmDir, dir, 'bin', 'java'))
    );
    
    res.json({ javaVersions });
  });

  app.get('/api/versions', authMiddleware, (_, res) => res.json(VERSIONS));

  app.get('/api/jars', authMiddleware, (_, res) => res.json(manager.getAvailableJars()));

  app.get('/api/servers', authMiddleware, (_, res) => {
    res.json(manager.getAllServers());
  });

  app.post('/api/servers', authMiddleware, async (req, res) => {
    const { name, type, version, port, memory } = req.body as {
      name: string; type: ServerType; version: string; port: number; memory: number;
    };
    try {
      const server = await manager.createServer({ name, type, version, port, memory });
      res.json(server);
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.get('/api/servers/:id', authMiddleware, (req, res) => {
    const server = manager.getServer(req.params.id);
    server ? res.json(server) : res.status(404).json({ error: 'Not found' });
  });

  app.post('/api/servers/:id/start', authMiddleware, async (req, res) => {
    await manager.startServer(req.params.id);
    res.json({ ok: true });
  });

  app.post('/api/servers/:id/stop', authMiddleware, (req, res) => {
    manager.stopServer(req.params.id);
    res.json({ ok: true });
  });

  app.delete('/api/servers/:id', authMiddleware, (req, res) => {
    manager.deleteServer(req.params.id);
    res.json({ ok: true });
  });

  app.get('/api/servers/:id/logs', authMiddleware, (req, res) => {
    res.json(manager.getLogs(req.params.id));
  });

  app.post('/api/servers/:id/command', authMiddleware, (req, res) => {
    manager.sendCommand(req.params.id, req.body.command);
    res.json({ ok: true });
  });

  // Portals
  app.get('/api/portals', authMiddleware, (req, res) => {
    res.json(manager.getPortals(req.query.serverId as string));
  });

  // Public portal endpoint for plugins (no auth)
  app.get('/api/public/portals', (req, res) => {
    res.json(manager.getPortals(req.query.serverId as string));
  });

  app.post('/api/portals', authMiddleware, (req, res) => {
    const portal = manager.createPortal(req.body);
    res.json(portal);
  });

  app.put('/api/portals/:id', authMiddleware, (req, res) => {
    try {
      const portal = manager.updatePortal(req.params.id, req.body);
      portal ? res.json(portal) : res.status(404).json({ error: 'Portal not found' });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/portals/:id', authMiddleware, (req, res) => {
    manager.deletePortal(req.params.id);
    res.json({ ok: true });
  });

  // Server properties
  app.get('/api/servers/:id/properties', authMiddleware, (req, res) => {
    const props = manager.getServerProperties(req.params.id);
    props ? res.json(props) : res.status(404).json({ error: 'Not found' });
  });

  app.put('/api/servers/:id/properties', authMiddleware, (req, res) => {
    try {
      manager.setServerProperties(req.params.id, req.body);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.put('/api/servers/:id/memory', authMiddleware, (req, res) => {
    try {
      manager.setServerMemory(req.params.id, req.body.memory);
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  // Backups
  app.get('/api/servers/:id/backups/config', authMiddleware, (req, res) => {
    res.json(manager.getBackupConfig(req.params.id));
  });

  app.put('/api/servers/:id/backups/config', authMiddleware, (req, res) => {
    manager.setBackupConfig(req.params.id, req.body);
    res.json({ ok: true });
  });

  app.get('/api/servers/:id/backups', authMiddleware, (req, res) => {
    res.json(manager.getBackups(req.params.id));
  });

  app.post('/api/servers/:id/backups', authMiddleware, async (req, res) => {
    try {
      const backup = await manager.createBackup(req.params.id);
      res.json({ backup });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.delete('/api/servers/:id/backups/:backupId', authMiddleware, (req, res) => {
    manager.deleteBackup(req.params.id, req.params.backupId);
    res.json({ ok: true });
  });

  // Player positions
  app.post('/api/servers/:id/players', (req, res) => {
    const { id } = req.params;
    const { players } = req.body;
    manager.updatePlayerPositions(id, players);
    res.json({ ok: true });
  });

  // BungeeCord
  app.get('/api/bungeecord/port', authMiddleware, (_, res) => {
    res.json({ port: manager.getBungeeCordPort() });
  });

  app.put('/api/bungeecord/port', authMiddleware, (req, res) => {
    manager.setBungeeCordPort(req.body.port);
    res.json({ ok: true });
  });

  // System management
  app.get('/api/system/status', authMiddleware, (_, res) => {
    res.json({
      backend: processManager.getBackendStatus(),
      frontend: processManager.getFrontendStatus()
    });
  });

  app.post('/api/system/frontend/start', authMiddleware, (_, res) => {
    try {
      processManager.startFrontend();
      res.json({ ok: true });
    } catch (e: any) {
      res.status(400).json({ error: e.message });
    }
  });

  app.post('/api/system/frontend/stop', authMiddleware, (_, res) => {
    processManager.stopFrontend();
    res.json({ ok: true });
  });

  app.post('/api/system/backend/restart', authMiddleware, (_, res) => {
    res.json({ ok: true, message: 'Backend restarting...' });
    processManager.restartBackend();
  });

  app.post('/api/system/shutdown', authMiddleware, (_, res) => {
    res.json({ ok: true, message: 'Shutting down...' });
    processManager.shutdown();
  });
}

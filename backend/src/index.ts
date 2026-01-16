import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { ServerManager } from './serverManager.js';
import { ProcessManager } from './processManager.js';
import { setupRoutes } from './routes.js';
import { setupAuth } from './auth.js';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.json());

const serverManager = new ServerManager(io);
const processManager = new ProcessManager();

// WebSocket namespaces
const serversNs = io.of('/servers');
const dashboardNs = io.of('/dashboard');

serversNs.on('connection', (socket) => {
  console.log(`[MC Server] Connected: ${socket.id}`);
  
  socket.on('register', (data: { serverId: string }) => {
    socket.join(data.serverId);
    console.log(`[MC Server] Registered: ${data.serverId}`);
  });
  
  socket.on('metrics', (data) => {
    serverManager.updateMetrics(data);
    dashboardNs.emit('metrics', data);
  });
  
  socket.on('disconnect', () => {
    console.log(`[MC Server] Disconnected: ${socket.id}`);
  });
});

dashboardNs.on('connection', (socket) => {
  console.log(`[Dashboard] Connected: ${socket.id}`);
  socket.emit('servers', serverManager.getAllServers());
  
  socket.on('disconnect', () => {
    console.log(`[Dashboard] Disconnected: ${socket.id}`);
  });
});

export { io, dashboardNs, serversNs };

setupAuth(app);
setupRoutes(app, serverManager, processManager);

const PORT = 3000;
httpServer.listen(PORT, () => {
  console.log(`MineManager Backend running on port ${PORT}`);
});

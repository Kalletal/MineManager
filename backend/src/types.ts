export type ServerType = 'paper' | 'purpur' | 'pufferfish' | 'mohist' | 'arclight';
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping';

export interface PlayerPosition {
  name: string;
  x: number;
  y: number;
  z: number;
  world: string;
}

export interface ServerConfig {
  id: string;
  name: string;
  type: ServerType;
  version: string;
  port: number;
  memory: number; // MB
}

export interface ServerState extends ServerConfig {
  status: ServerStatus;
  players: string[];
  playerPositions?: PlayerPosition[];
  tps: number;
  usedMemory: number;
  serverIp?: string;
}

export interface Portal {
  id: string;
  name: string;
  serverId: string;
  targetServerId: string;
  x: number;
  y: number;
  z: number;
  world: string;
  shape?: 'sphere' | 'flat' | 'rectangle'; // sphere = 3D, flat = 2D circle, rectangle = 2D box
  x2?: number; // Second corner for rectangle
  z2?: number;
}

export interface ServerMetrics {
  serverId: string;
  tps: number;
  players: string[];
  usedMemory: number;
  maxMemory: number;
  timestamp: number;
}

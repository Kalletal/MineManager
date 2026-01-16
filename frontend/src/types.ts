export type ServerType = 'paper' | 'purpur' | 'pufferfish' | 'mohist' | 'arclight';
export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping';

export interface ServerState {
  id: string;
  name: string;
  type: ServerType;
  version: string;
  port: number;
  memory: number;
  status: ServerStatus;
  players: string[];
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
  x2?: number;
  z2?: number;
  world: string;
  shape?: 'sphere' | 'flat' | 'rectangle';
}

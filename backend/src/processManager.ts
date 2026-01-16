import { spawn, ChildProcess, exec } from 'child_process';
import * as path from 'path';

export class ProcessManager {
  private frontendProcess: ChildProcess | null = null;
  private frontendLogs: string[] = [];

  constructor() {
    this.checkFrontend();
  }

  private checkFrontend(): void {
    exec('lsof -ti:5173', (err, stdout) => {
      if (stdout.trim()) {
        this.frontendLogs.push('Frontend already running on port 5173');
      }
    });
  }

  startFrontend(): void {
    if (this.frontendProcess) {
      throw new Error('Frontend already running');
    }

    const frontendDir = path.join(process.cwd(), '..', 'frontend');
    this.frontendProcess = spawn('npm', ['run', 'dev'], { 
      cwd: frontendDir,
      shell: true 
    });

    this.frontendProcess.stdout?.on('data', (data) => {
      const line = data.toString();
      this.frontendLogs.push(line);
      if (this.frontendLogs.length > 100) this.frontendLogs.shift();
    });

    this.frontendProcess.stderr?.on('data', (data) => {
      const line = data.toString();
      this.frontendLogs.push(line);
      if (this.frontendLogs.length > 100) this.frontendLogs.shift();
    });

    this.frontendProcess.on('exit', () => {
      this.frontendProcess = null;
      this.frontendLogs.push('Frontend stopped');
    });
  }

  stopFrontend(): void {
    if (this.frontendProcess) {
      this.frontendProcess.kill();
      this.frontendProcess = null;
    }
  }

  getFrontendStatus(): { running: boolean; logs: string[] } {
    return {
      running: this.frontendProcess !== null,
      logs: this.frontendLogs
    };
  }

  getBackendStatus(): { running: boolean; uptime: number } {
    return {
      running: true,
      uptime: process.uptime()
    };
  }

  restartBackend(): void {
    // Trigger process exit, systemd/pm2 will restart
    setTimeout(() => process.exit(0), 1000);
  }

  shutdown(): void {
    // Stop frontend
    this.stopFrontend();
    
    // Kill all processes
    exec('pkill -f "BungeeCord.jar"', () => {});
    exec('pkill -f "java.*server.jar.*nogui"', () => {});
    
    // Exit backend after delay
    setTimeout(() => process.exit(0), 2000);
  }
}

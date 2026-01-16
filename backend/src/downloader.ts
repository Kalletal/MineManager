import * as fs from 'fs';
import * as path from 'path';
import { spawn } from 'child_process';
import { ServerType } from './types.js';

type ProgressCallback = (progress: number, message: string) => void;

export class ServerDownloader {
  private jarsDir = path.join(process.cwd(), 'servers', 'jars');
  private buildToolsDir = path.join(process.cwd(), 'servers', 'buildtools');
  private building = new Map<string, { progress: number; message: string }>();

  constructor() {
    fs.mkdirSync(this.jarsDir, { recursive: true });
    fs.mkdirSync(this.buildToolsDir, { recursive: true });
  }

  getAvailableJars(): Record<string, string[]> {
    const jars: Record<string, string[]> = { paper: [], purpur: [], pufferfish: [], mohist: [], arclight: [] };
    if (!fs.existsSync(this.jarsDir)) return jars;
    for (const file of fs.readdirSync(this.jarsDir)) {
      const match = file.match(/^(paper|purpur|pufferfish|mohist|arclight)-(.+)\.jar$/);
      if (match && fs.statSync(path.join(this.jarsDir, file)).size > 1000) {
        jars[match[1]].push(match[2]);
      }
    }
    return jars;
  }

  getBuildStatus(type: ServerType, version: string): { progress: number; message: string } | null {
    return this.building.get(`${type}-${version}`) || null;
  }

  getAllBuildStatus(): Record<string, { progress: number; message: string }> {
    return Object.fromEntries(this.building);
  }

  async getJar(type: ServerType, version: string, onProgress?: ProgressCallback): Promise<string> {
    const jarPath = path.join(this.jarsDir, `${type}-${version}.jar`);
    if (fs.existsSync(jarPath) && fs.statSync(jarPath).size > 1000) return jarPath;

    const key = `${type}-${version}`;
    if (this.building.has(key)) throw new Error(`Already building ${type} ${version}`);

    this.building.set(key, { progress: 0, message: 'Starting...' });
    const updateProgress = (progress: number, message: string) => {
      this.building.set(key, { progress, message });
      onProgress?.(progress, message);
    };

    try {
      updateProgress(50, 'Downloading...');
      const url = await this.getDownloadUrl(type, version);
      await this.download(url, jarPath);
      updateProgress(100, 'Done');
    } finally {
      this.building.delete(key);
    }
    return jarPath;
  }

  private getJavaForVersion(mcVersion: string): { path: string; version: string } | null {
    const [major, minor] = mcVersion.split('.').map(Number);
    const patch = parseInt(mcVersion.split('.')[2] || '0');
    
    console.log(`Looking for Java for MC ${mcVersion} (${major}.${minor}.${patch})`);
    
    // Get all available Java installations
    const jvmDir = '/usr/lib/jvm';
    let availableJavas: string[] = [];
    try {
      if (fs.existsSync(jvmDir)) {
        availableJavas = fs.readdirSync(jvmDir).filter(dir => 
          fs.statSync(path.join(jvmDir, dir)).isDirectory()
        );
        console.log('Available Java installations:', availableJavas);
      }
    } catch (e) {
      console.log('Could not read JVM directory:', e);
    }
    
    // MC 1.17 - 1.20.4 requires Java 17
    if (minor >= 17 && !(major > 1 || minor >= 21 || (minor === 20 && patch >= 5))) {
      console.log('Looking for Java 17...');
      const java17Dirs = availableJavas.filter(dir => 
        dir.includes('java-17') || dir.includes('jdk-17') || dir.includes('openjdk-17')
      );
      console.log('Java 17 candidates:', java17Dirs);
      for (const dir of java17Dirs) {
        const p = path.join(jvmDir, dir);
        const javaExe = path.join(p, 'bin', 'java');
        console.log(`Checking ${javaExe}: ${fs.existsSync(javaExe) ? 'EXISTS' : 'NOT FOUND'}`);
        if (fs.existsSync(javaExe)) {
          console.log(`Found Java 17 at: ${p}`);
          return { path: p, version: '17' };
        }
      }
    }
    
    // MC 1.21+ or 1.20.5+ requires Java 21
    if (major > 1 || minor >= 21 || (minor === 20 && patch >= 5)) {
      console.log('Looking for Java 21...');
      const java21Dirs = availableJavas.filter(dir => 
        dir.includes('java-21') || dir.includes('jdk-21') || dir.includes('openjdk-21')
      );
      console.log('Java 21 candidates:', java21Dirs);
      for (const dir of java21Dirs) {
        const p = path.join(jvmDir, dir);
        const javaExe = path.join(p, 'bin', 'java');
        if (fs.existsSync(javaExe)) return { path: p, version: '21' };
      }
    }
    
    // Older versions use Java 8
    console.log('Looking for Java 8...');
    const java8Dirs = availableJavas.filter(dir => 
      dir.includes('java-8') || dir.includes('jdk-8') || dir.includes('openjdk-8') || dir.includes('jdk1.8')
    );
    console.log('Java 8 candidates:', java8Dirs);
    for (const dir of java8Dirs) {
      const p = path.join(jvmDir, dir);
      const javaExe = path.join(p, 'bin', 'java');
      if (fs.existsSync(javaExe)) return { path: p, version: '8' };
    }
    
    console.log('No suitable Java found');
    return null;
  }

  private async buildSpigot(version: string, destPath: string, onProgress: ProgressCallback): Promise<void> {
    const buildToolsJar = path.join(this.buildToolsDir, 'BuildTools.jar');
    if (!fs.existsSync(buildToolsJar)) {
      onProgress(5, 'Downloading BuildTools...');
      await this.download('https://hub.spigotmc.org/jenkins/job/BuildTools/lastSuccessfulBuild/artifact/target/BuildTools.jar', buildToolsJar);
    }

    const java = this.getJavaForVersion(version);
    if (!java) throw new Error(`Java required for MC ${version} is not installed. Install openjdk-17-jdk or openjdk-21-jdk.`);
    
    const javaPath = path.join(java.path, 'bin', 'java');
    
    onProgress(10, `Starting BuildTools (Java ${java.version})...`);
    return new Promise((resolve, reject) => {
      const env = { 
        ...process.env, 
        JAVA_HOME: java.path,
        PATH: `${java.path}/bin:${process.env.PATH}`
      };
      const proc = spawn(javaPath, ['-jar', 'BuildTools.jar', '--rev', version], { 
        cwd: this.buildToolsDir,
        env
      });
      
      proc.stdout?.on('data', (d) => {
        const line = d.toString();
        process.stdout.write(line);
        if (line.includes('Pulling updates')) onProgress(15, 'Pulling updates...');
        else if (line.includes('Cloning')) onProgress(20, 'Cloning repositories...');
        else if (line.includes('Applying patches')) onProgress(40, 'Applying patches...');
        else if (line.includes('Compiling Bukkit')) onProgress(50, 'Compiling Bukkit...');
        else if (line.includes('Compiling CraftBukkit')) onProgress(65, 'Compiling CraftBukkit...');
        else if (line.includes('Compiling Spigot')) onProgress(80, 'Compiling Spigot...');
        else if (line.includes('Success!')) onProgress(95, 'Finalizing...');
      });
      proc.stderr?.on('data', (d) => process.stderr.write(d));
      
      proc.on('exit', (code) => {
        if (code !== 0) return reject(new Error(`BuildTools failed with code ${code}`));
        const builtJar = path.join(this.buildToolsDir, `spigot-${version}.jar`);
        if (!fs.existsSync(builtJar)) return reject(new Error('Spigot JAR not found'));
        fs.copyFileSync(builtJar, destPath);
        onProgress(100, 'Done');
        resolve();
      });
    });
  }

  private async getDownloadUrl(type: ServerType, version: string): Promise<string> {
    switch (type) {
      case 'paper': {
        const res = await fetch(`https://api.papermc.io/v2/projects/paper/versions/${version}/builds`);
        if (!res.ok) throw new Error(`Paper API error: ${res.status}`);
        const builds = await res.json();
        const build = builds.builds[builds.builds.length - 1];
        return `https://api.papermc.io/v2/projects/paper/versions/${version}/builds/${build.build}/downloads/${build.downloads.application.name}`;
      }
      case 'purpur': {
        const res = await fetch(`https://api.purpurmc.org/v2/purpur/${version}`);
        if (!res.ok) throw new Error(`Purpur API error: ${res.status}`);
        const data = await res.json();
        return `https://api.purpurmc.org/v2/purpur/${version}/${data.builds.latest}/download`;
      }
      case 'pufferfish': {
        // Version mapping: 1.21.1 -> job Pufferfish-1.21, 1.20.4 -> Pufferfish-1.20
        const majorMinor = version.split('.').slice(0, 2).join('.');
        const apiUrl = `https://ci.pufferfish.host/job/Pufferfish-${majorMinor}/lastSuccessfulBuild/api/json`;
        const res = await fetch(apiUrl);
        if (!res.ok) throw new Error(`Pufferfish API error: ${res.status}`);
        const data = await res.json();
        const artifact = data.artifacts?.[0];
        if (!artifact) throw new Error('Pufferfish artifact not found');
        return `https://ci.pufferfish.host/job/Pufferfish-${majorMinor}/lastSuccessfulBuild/artifact/${artifact.relativePath}`;
      }
      case 'mohist': {
        const res = await fetch(`https://api.mohistmc.com/project/mohist/${version}/builds`);
        if (!res.ok) throw new Error(`Mohist API error: ${res.status}`);
        const builds = await res.json();
        if (!builds || builds.length === 0) throw new Error('No Mohist builds available');
        const latestBuild = builds[0];
        if (!latestBuild || !latestBuild.id) throw new Error('Invalid Mohist build data');
        return `https://api.mohistmc.com/project/mohist/${version}/builds/${latestBuild.id}/download`;
      }
      case 'arclight': {
        const res = await fetch(`https://api.github.com/repos/IzzelAliz/Arclight/releases`);
        if (!res.ok) throw new Error(`Arclight API error: ${res.status}`);
        const releases = await res.json();
        const release = releases.find((r: any) => r.tag_name.includes(version));
        if (!release) throw new Error(`Arclight ${version} not found`);
        const asset = release.assets.find((a: any) => a.name.endsWith('.jar') && a.name.includes('forge'));
        if (!asset) throw new Error(`Arclight JAR not found`);
        return asset.browser_download_url;
      }
    }
  }

  private async download(url: string, dest: string): Promise<void> {
    const res = await fetch(url, { redirect: 'follow' });
    if (!res.ok) throw new Error(`Download failed: ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 1000) throw new Error(`File too small (${buffer.length} bytes)`);
    fs.writeFileSync(dest, buffer);
    console.log(`Saved ${(buffer.length / 1024 / 1024).toFixed(1)} MB`);
  }
}

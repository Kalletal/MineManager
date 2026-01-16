import { Request, Response, NextFunction, Express } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USERS_FILE = join(__dirname, '../data/users.json');
const JWT_SECRET = process.env.JWT_SECRET || 'minemanager-secret-key-change-in-prod';

interface User { username: string; password: string; lang: string; role: 'admin' | 'user'; }

function loadUsers(): Record<string, User> {
  if (!existsSync(USERS_FILE)) return {};
  return JSON.parse(readFileSync(USERS_FILE, 'utf-8'));
}

function saveUsers(users: Record<string, User>) {
  const dir = dirname(USERS_FILE);
  if (!existsSync(dir)) require('fs').mkdirSync(dir, { recursive: true });
  writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

export function authMiddleware(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { username: string };
    (req as any).user = decoded.username;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function setupAuth(app: Express) {
  // Init default admin if no users
  const users = loadUsers();
  if (Object.keys(users).length === 0) {
    users['admin'] = { username: 'admin', password: bcrypt.hashSync('admin', 10), lang: 'en', role: 'admin' };
    saveUsers(users);
  }

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body;
    const users = loadUsers();
    const user = users[username];
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { username, lang: user.lang, role: user.role } });
  });

  app.get('/api/auth/me', authMiddleware, (req, res) => {
    const users = loadUsers();
    const user = users[(req as any).user];
    res.json({ username: user.username, lang: user.lang, role: user.role });
  });

  app.put('/api/auth/password', authMiddleware, (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const users = loadUsers();
    const user = users[(req as any).user];
    if (!bcrypt.compareSync(currentPassword, user.password)) {
      return res.status(400).json({ error: 'Wrong current password' });
    }
    user.password = bcrypt.hashSync(newPassword, 10);
    saveUsers(users);
    res.json({ ok: true });
  });

  app.put('/api/auth/lang', authMiddleware, (req, res) => {
    const { lang } = req.body;
    const users = loadUsers();
    users[(req as any).user].lang = lang;
    saveUsers(users);
    res.json({ ok: true });
  });

  app.get('/api/auth/users', authMiddleware, (req, res) => {
    const users = loadUsers();
    const currentUser = users[(req as any).user];
    if (currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    res.json(Object.values(users).map(u => ({ username: u.username, role: u.role })));
  });

  app.post('/api/auth/users', authMiddleware, (req, res) => {
    const { username, password, role = 'user' } = req.body;
    const users = loadUsers();
    const currentUser = users[(req as any).user];
    if (currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (users[username]) return res.status(400).json({ error: 'User exists' });
    users[username] = { username, password: bcrypt.hashSync(password, 10), lang: 'en', role };
    saveUsers(users);
    res.json({ ok: true });
  });

  app.delete('/api/auth/users/:username', authMiddleware, (req, res) => {
    const users = loadUsers();
    const currentUser = users[(req as any).user];
    if (currentUser.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
    if (req.params.username === (req as any).user) return res.status(400).json({ error: 'Cannot delete yourself' });
    delete users[req.params.username];
    saveUsers(users);
    res.json({ ok: true });
  });
}

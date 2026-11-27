import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { handleApiRequest } from './server/api-handler.ts';
import type { DbAdapter } from './server/d1-storage.ts';
import { loadDb, saveDb } from './server/store.ts';

const nodeDbAdapter: DbAdapter = {
  load: () => loadDb(),
  save: (db) => saveDb(db),
  getConfigValue: async (key) => {
    const db = loadDb();
    const map = db.custom_config || {};
    return key in map ? map[key] : null;
  },
  setConfigValue: async (key, value) => {
    const db = loadDb();
    db.custom_config = { ...(db.custom_config || {}), [key]: value };
    saveDb(db);
  },
  deleteConfigValue: async (key) => {
    const db = loadDb();
    if (!db.custom_config || !(key in db.custom_config)) return false;
    delete db.custom_config[key];
    saveDb(db);
    return true;
  },
  listAllCustomConfig: async () => {
    const db = loadDb();
    return { ...(db.custom_config || {}) };
  },
};

async function startServer() {
  const app = express();
  app.use(express.text({ type: '*/*', limit: '2mb' }));

  app.use('/api', async (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || 'localhost:3000';
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(key, value);
      else if (Array.isArray(value)) headers.set(key, value.join(', '));
    }

    const method = req.method.toUpperCase();
    const hasBody = method !== 'GET' && method !== 'HEAD';
    const rawBody =
      hasBody && typeof req.body === 'string'
        ? req.body
        : hasBody && req.body && typeof req.body === 'object'
          ? JSON.stringify(req.body)
          : undefined;

    const webRequest = new Request(url, {
      method,
      headers,
      body: rawBody,
    });

    const webResponse = await handleApiRequest(
      webRequest,
      nodeDbAdapter,
      process.env.GEMINI_API_KEY,
      {
        environment: process.env.NODE_ENV || 'development',
        appUrl: process.env.APP_URL,
        storage: 'local-json',
        brevoApiKey: process.env.BREVO_API_KEY || process.env.BREVO_KEY,
        brevoSenderEmail: process.env.BREVO_SENDER_EMAIL || process.env.SENDER_EMAIL,
        brevoSenderName: process.env.BREVO_SENDER_NAME,
        resendApiKey: process.env.RESEND_API_KEY,
      }
    );

    res.status(webResponse.status);
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });
    const text = await webResponse.text();
    res.send(text);
  });

  // Serve frontend (Vite middleware in dev, dist/ in prod)
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      const indexFile = path.join(distDir, 'index.html');
      if (fs.existsSync(indexFile)) {
        res.sendFile(indexFile);
      } else {
        res.status(404).send('Build output not found. Run npm run build.');
      }
    });
  }

  const port = Number(process.env.PORT) || 3000;
  app.listen(port, '0.0.0.0', () => {
    console.log(`Sunmedx Funnel Autopilot running on http://0.0.0.0:${port}`);
  });
}

startServer();

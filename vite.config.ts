import type { IncomingMessage, ServerResponse } from 'node:http'
import { loadEnv } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import svgr from 'vite-plugin-svgr'

// Custom plugin to handle ?import&react syntax (alias to ?react)
const svgImportPlugin = () => ({
  name: 'svg-import-alias',
  resolveId(id: string) {
    // Transform ?import&react to ?react for vite-plugin-svgr
    if (id.includes('?import&react')) {
      return id.replace('?import&react', '?react');
    }
    return null;
  },
});

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

const localApiPlugin = (mode: string) => ({
  name: 'local-serverless-api',
  configureServer(server: { middlewares: { use: Function } }) {
    const env = loadEnv(mode, process.cwd(), '');
    if (env.GEMINI_API_KEY) process.env.GEMINI_API_KEY = env.GEMINI_API_KEY;

    server.middlewares.use('/api/ai/parse-invoice', async (req: IncomingMessage, res: ServerResponse, next: Function) => {
      if (req.method !== 'POST') return next();

      try {
        const { default: handler } = await import('./api/ai/parse-invoice');
        const request = Object.assign(req, { body: await readJsonBody(req) });
        const response = Object.assign(res, {
          status(code: number) {
            res.statusCode = code;
            return response;
          },
          json(payload: unknown) {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(JSON.stringify(payload));
            return response;
          },
        });
        await handler(request as never, response as never);
      } catch (error) {
        console.error('Local AI API failed', error);
        if (!res.headersSent) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: 'Local AI API failed to start.' }));
        }
      }
    });
  },
});

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    localApiPlugin(mode),
    svgImportPlugin(),
    svgr({
      // Support named ReactComponent export (for ?react syntax)
      svgrOptions: {
        exportType: 'named',
        namedExport: 'ReactComponent',
        ref: true,
        svgo: false,
        titleProp: true,
      },
      include: '**/*.svg?react',
    }),
  ],
  server: {
    allowedHosts: true as const,
    hmr: false,
  },
}))

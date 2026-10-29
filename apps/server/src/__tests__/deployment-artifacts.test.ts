import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EnvSchema } from '../config/env.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../../../..');

describe('IMP-027: Deployment Artifacts & Configuration Verification', () => {
  describe('1. Vercel SPA Configuration (apps/client/vercel.json)', () => {
    const vercelJsonPath = path.join(REPO_ROOT, 'apps/client/vercel.json');

    it('exists at apps/client/vercel.json', () => {
      expect(fs.existsSync(vercelJsonPath)).toBe(true);
    });

    it('is valid JSON and contains the SPA fallback rewrite to /index.html', () => {
      const rawContent = fs.readFileSync(vercelJsonPath, 'utf-8');
      const parsed = JSON.parse(rawContent) as {
        rewrites?: Array<{ source: string; destination: string }>;
        framework?: string;
      };

      expect(Array.isArray(parsed.rewrites)).toBe(true);
      const fallbackRewrite = parsed.rewrites?.find(
        (r) => r.source === '/(.*)' && r.destination === '/index.html'
      );
      expect(fallbackRewrite).toBeDefined();
    });
  });

  describe('2. Render Web Service Blueprint (render.yaml)', () => {
    const renderYamlPath = path.join(REPO_ROOT, 'render.yaml');

    it('exists at repository root', () => {
      expect(fs.existsSync(renderYamlPath)).toBe(true);
    });

    it('defines the web service, build order, start command, and health check path', () => {
      const content = fs.readFileSync(renderYamlPath, 'utf-8');

      expect(content).toContain('type: web');
      expect(content).toContain('healthCheckPath: /api/v1/health');

      // Verifies @mentora/shared is built before @mentora/server
      const sharedBuildIdx = content.indexOf('@mentora/shared build');
      const serverBuildIdx = content.indexOf('@mentora/server build');
      expect(sharedBuildIdx).toBeGreaterThan(-1);
      expect(serverBuildIdx).toBeGreaterThan(-1);
      expect(sharedBuildIdx).toBeLessThan(serverBuildIdx);

      // Start command
      expect(content).toContain('startCommand: pnpm --filter @mentora/server start');
    });

    it('configures required environment variables and sets sync: false for secrets', () => {
      const content = fs.readFileSync(renderYamlPath, 'utf-8');

      const expectedKeys = [
        'NODE_ENV',
        'PORT',
        'MONGODB_URI',
        'JWT_SECRET',
        'JWT_EXPIRES_IN',
        'CLIENT_ORIGIN',
        'GEMINI_API_KEY',
        'GEMINI_FAST_MODEL',
        'GEMINI_REASONING_MODEL',
        'DAILY_AI_QUOTA_LIMIT',
      ];

      for (const key of expectedKeys) {
        expect(content).toContain(`key: ${key}`);
      }

      // Sensitive keys must use sync: false in Render blueprints
      const sensitiveKeys = ['MONGODB_URI', 'JWT_SECRET', 'GEMINI_API_KEY', 'CLIENT_ORIGIN'];
      for (const key of sensitiveKeys) {
        const keyIdx = content.indexOf(`key: ${key}`);
        expect(keyIdx).toBeGreaterThan(-1);
        const section = content.slice(keyIdx, keyIdx + 80);
        expect(section).toContain('sync: false');
      }

      // Must not contain hardcoded real secrets
      expect(content).not.toMatch(/mongodb(\+srv)?:\/\/[^<:\s]+:[^@\s]+@/);
      expect(content).not.toMatch(/AIzaSy/);
    });
  });

  describe('3. Environment Templates (.env.example)', () => {
    const serverEnvExamplePath = path.join(REPO_ROOT, 'apps/server/.env.example');
    const clientEnvExamplePath = path.join(REPO_ROOT, 'apps/client/.env.example');

    it('apps/server/.env.example exists and documents all keys in EnvSchema', () => {
      expect(fs.existsSync(serverEnvExamplePath)).toBe(true);
      const content = fs.readFileSync(serverEnvExamplePath, 'utf-8');

      // Parse env keys from file
      const lines = content.split('\n');
      const parsedKeys = new Set<string>();
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const eqIdx = trimmed.indexOf('=');
          if (eqIdx !== -1) {
            parsedKeys.add(trimmed.slice(0, eqIdx).trim());
          }
        }
      }

      const schemaKeys = Object.keys(EnvSchema.shape);
      for (const key of schemaKeys) {
        expect(parsedKeys.has(key)).toBe(true);
      }
    });

    it('apps/server/.env.example contains only safe placeholders with no real credentials', () => {
      const content = fs.readFileSync(serverEnvExamplePath, 'utf-8');

      // Placeholders must be present
      expect(content).toContain('MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/mentora');
      expect(content).toContain('JWT_SECRET=<replace-with-minimum-32-character-random-secret>');
      expect(content).toContain('GEMINI_API_KEY=<replace-with-google-ai-studio-api-key>');

      // No live GCP API keys or real passwords
      expect(content).not.toMatch(/AIzaSy[A-Za-z0-9_-]{33}/);
      expect(content).not.toMatch(/mongodb(\+srv)?:\/\/[a-zA-Z0-9_]+:[a-zA-Z0-9_]+@/);
    });

    it('apps/client/.env.example exists and documents VITE_API_BASE_URL', () => {
      expect(fs.existsSync(clientEnvExamplePath)).toBe(true);
      const content = fs.readFileSync(clientEnvExamplePath, 'utf-8');

      expect(content).toContain('VITE_API_BASE_URL=http://localhost:4000/api/v1');
    });
  });

  describe('4. Git Secret Hygiene (.gitignore)', () => {
    const gitignorePath = path.join(REPO_ROOT, '.gitignore');

    it('ignores .env and allows .env.example', () => {
      expect(fs.existsSync(gitignorePath)).toBe(true);
      const content = fs.readFileSync(gitignorePath, 'utf-8');

      expect(content).toContain('.env');
      expect(content).toContain('!.env.example');
      expect(content).toContain('node_modules/');
      expect(content).toContain('dist/');
    });
  });
});


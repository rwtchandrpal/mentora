import http from 'http';
import { app } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { ensureDemoUser } from './services/auth.service.js';

let server: http.Server | null = null;

export const startServer = async (): Promise<http.Server> => {
  await connectDatabase();

  try {
    await ensureDemoUser();
    logger.info('Demo user account ensured (jhon@email.com)');
  } catch (err) {
    logger.error({ err }, 'Failed to ensure demo user account on startup');
  }

  server = app.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        nodeEnv: env.NODE_ENV,
        clientOrigin: env.CLIENT_ORIGIN,
      },
      `Mentora server listening on port ${env.PORT}`
    );
  });

  return server;
};

export const handleShutdown = async (signal: string): Promise<void> => {
  logger.info({ signal }, 'Received shutdown signal, closing server gracefully...');
  if (server) {
    server.close(async () => {
      logger.info('HTTP server closed');
      try {
        await disconnectDatabase();
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });
  } else {
    try {
      await disconnectDatabase();
      process.exit(0);
    } catch (err) {
      logger.error({ err }, 'Error during shutdown');
      process.exit(1);
    }
  }
};

process.on('SIGTERM', () => {
  void handleShutdown('SIGTERM');
});

process.on('SIGINT', () => {
  void handleShutdown('SIGINT');
});

export const isServerWorkspaceReady = (): boolean => true;

if (process.env.NODE_ENV !== 'test') {
  void startServer().catch((err) => {
    logger.error({ err }, 'Failed to start Mentora server');
    process.exit(1);
  });
}

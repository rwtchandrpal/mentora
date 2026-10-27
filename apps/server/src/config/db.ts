import mongoose from 'mongoose';
import { env } from './env.js';
import { logger } from './logger.js';

export const connectDatabase = async (uri: string = env.MONGODB_URI): Promise<typeof mongoose> => {
  try {
    logger.info('Connecting to MongoDB...');
    const conn = await mongoose.connect(uri);
    logger.info(
      { host: conn.connection.host, name: conn.connection.name },
      'Connected to MongoDB successfully'
    );
    return conn;
  } catch (error) {
    logger.error({ err: error }, 'Failed to connect to MongoDB');
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  try {
    logger.info('Disconnecting from MongoDB...');
    await mongoose.disconnect();
    logger.info('Disconnected from MongoDB successfully');
  } catch (error) {
    logger.error({ err: error }, 'Error during MongoDB disconnection');
    throw error;
  }
};

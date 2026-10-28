import { Response } from 'express';
import {
  SseStartEventDTO,
  SseTokenEventDTO,
  SseMetadataEventDTO,
  SseErrorEventDTO,
} from '@mentora/shared';
import { logger } from '../config/logger.js';

export class SseWriter {
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isClosed = false;

  constructor(private readonly res: Response) {
    // Mandatory SSE Headers (architecture.md Sections G.3 & H.2, AGENTS.md Section M)
    this.res.setHeader('Content-Type', 'text/event-stream');
    this.res.setHeader('Cache-Control', 'no-cache, no-transform');
    this.res.setHeader('Connection', 'keep-alive');
    this.res.setHeader('X-Accel-Buffering', 'no');
    this.res.flushHeaders();

    this.startHeartbeat();

    const cleanup = () => {
      this.stopHeartbeat();
      this.isClosed = true;
    };

    this.res.on('close', cleanup);
    this.res.on('finish', cleanup);
    this.res.on('error', cleanup);
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      if (!this.isClosed && !this.res.writableEnded) {
        try {
          this.res.write(': keepalive\n\n');
        } catch (err) {
          logger.warn({ err }, 'Failed to write SSE keepalive heartbeat');
          this.stopHeartbeat();
        }
      }
    }, 15000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  sendStart(payload: SseStartEventDTO): void {
    this.writeEvent('start', JSON.stringify(payload));
  }

  sendToken(payload: SseTokenEventDTO): void {
    this.writeEvent('token', JSON.stringify(payload));
  }

  sendMetadata(payload: SseMetadataEventDTO): void {
    this.writeEvent('metadata', JSON.stringify(payload));
  }

  sendDone(): void {
    this.writeEvent('done', '[DONE]');
  }

  sendError(payload: SseErrorEventDTO): void {
    this.writeEvent('error', JSON.stringify(payload));
  }

  private writeEvent(eventName: string, data: string): void {
    if (this.isClosed || this.res.writableEnded) {
      return;
    }
    this.res.write(`event: ${eventName}\ndata: ${data}\n\n`);
  }

  close(): void {
    this.stopHeartbeat();
    this.isClosed = true;
    if (!this.res.writableEnded) {
      this.res.end();
    }
  }
}


import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,       // Colored console output
      translateTime: 'HH:MM:ss', // Human-readable timestamp
      ignore: 'pid,hostname' // Remove extra fields
    }
  }
});

export default logger;
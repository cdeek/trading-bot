import { connection } from './solanaClient.js';
import logger from '../utils/logger.js';

export function listenProgramLogs(programId, callback) {
  connection.onLogs(programId, (logInfo) => {
    // Log every event
    logger.info({ programId: programId.toBase58(), logs: logInfo.logs }, 'New program log received');

    // Execute custom logic
    callback(logInfo);
  }, 'confirmed');
}
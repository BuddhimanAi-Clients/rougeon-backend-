import { configDotenv } from 'dotenv';
configDotenv();

import { app } from './app.js';
import { logger } from './configs/logger.config.js';
import { envVariables } from './configs/env.config.js';
const PORT = envVariables.PORT;

async function server() {
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT}`);
    logger.info(`API endpoints available at ${envVariables.SERVER_URL}/api`);
  });
}

server();

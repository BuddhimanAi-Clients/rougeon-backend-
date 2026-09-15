import cors from 'cors';
import express from 'express';
import { toNodeHandler } from 'better-auth/node';
import { adminRouter } from './admin/admin.routes.js';
import { envVariables } from './configs/env.config.js';
import { posRouter } from './pos/pos.routes.js';
import { auth } from './shared/auth/auth.config.js';
import { authEmailRateLimit } from './shared/auth/auth-rate-limit.middleware.js';
import { errorHandler } from './shared/errors/error.middleware.js';
import { notFoundHandler } from './shared/errors/not-found.middleware.js';
import { sharedProductRouter } from './shared/products/product.routes.js';
import { webRouter } from './web/web.routes.js';
import { shippingRouter } from './shared/shipping/shipping.routes.js';

const app = express();

if (envVariables.TRUST_PROXY) {
  app.set('trust proxy', 1);
}

app.disable('x-powered-by');

app.use(
  cors({
    origin: envVariables.CORS_ORIGINS,
    credentials: true,
  }),
);

// Better Auth must receive the untouched request body.
app.all('/api/v1/auth/*splat', authEmailRateLimit, toNodeHandler(auth));

app.use(express.json({ limit: '1mb' }));

const healthHandler: express.RequestHandler = (_request, response) => {
  response.status(200).json({ status: 'healthy' });
};

app.get('/', healthHandler);
app.get('/api/v1/health', healthHandler);

app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/pos', posRouter);
app.use('/api/v1', sharedProductRouter);
app.use('/api/v1', shippingRouter);
app.use('/api/v1', webRouter);

app.use(notFoundHandler);
app.use(errorHandler);

export { app };

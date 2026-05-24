import { Hono } from 'hono';
import { authMiddleware, corsMiddleware } from './lib/middleware';
import { log } from './lib/http';
import { healthRoute } from './routes/health';
import { summaryRoute } from './routes/summary';
import { translateRoute } from './routes/translate';
import { suggestRoute } from './routes/suggest';
import { studyRoute } from './routes/study';
import type { Bindings } from './types';

const app = new Hono<{ Bindings: Bindings }>();

app.use('*', corsMiddleware);
app.use('*', authMiddleware);

app.route('/', healthRoute);
app.route('/', summaryRoute);
app.route('/', translateRoute);
app.route('/', suggestRoute);
app.route('/', studyRoute);

app.onError((err, c) => {
	log('Unhandled error', { error: String(err), stack: err.stack });
	return c.json({ error: 'Internal server error', message: err.message }, 500);
});

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export default app;

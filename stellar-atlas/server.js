import express from 'express';
import path from 'node:path';
import {
  fileURLToPath,
} from 'node:url';

const app = express();
const root = path.dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT) || 3000;

app.disable('x-powered-by');
app.use(express.static(path.join(root, 'public'), {
  extensions: ['html'],
}));
app.use('/vendor/three', express.static(path.join(root, 'node_modules', 'three')));

app.get('/health', (_request, response) => {
  response.json({
    status: 'ok',
    service: 'stellar-atlas',
  });
});

app.get('*splat', (_request, response) => {
  response.sendFile(path.join(root, 'public', 'index.html'));
});

app.listen(port, () => {
  console.log(`Stellar Atlas is running at http://localhost:${port}`);
});

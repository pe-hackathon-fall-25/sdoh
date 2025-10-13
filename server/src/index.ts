import { createServer } from 'http';
import app, { setupWebSocket } from './app';

const PORT = process.env.PORT || 4000;

// Create HTTP server
const server = createServer(app);

// Setup WebSocket
setupWebSocket(server);

// Start server
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`HTTP: http://localhost:${PORT}`);
  console.log(`WebSocket: ws://localhost:${PORT}/api/voice/stream`);
});
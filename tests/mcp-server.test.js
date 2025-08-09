import { WebSocket } from 'ws';
import { spawn } from 'child_process';

describe('mcp-server', () => {
  let serverProcess;
  beforeAll((done) => {
    serverProcess = spawn('node', ['mcp-server.js']);
    serverProcess.stderr.on('data', (data) => {
      if (data.toString().includes('Turtle connected')) done();
    });
    setTimeout(done, 1000); // fallback if event doesn't fire
  });
  afterAll(() => {
    if (serverProcess) serverProcess.kill();
  });
  test('WebSocket server should accept connection', (done) => {
    const ws = new WebSocket('ws://localhost:3001');
    ws.on('open', () => {
      ws.terminate();
      done();
    });
    ws.on('error', (err) => {
      done.fail(err);
    });
  });
});
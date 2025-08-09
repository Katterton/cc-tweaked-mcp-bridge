import { WebSocket } from 'ws';
import { spawn } from 'child_process';

describe('mcp-server', () => {
  let serverProcess;
  let ready = false;
  beforeAll((done) => {
    serverProcess = spawn('node', ['mcp-server.js']);
    const onReady = () => {
      if (!ready) {
        ready = true;
        done();
      }
    };
    serverProcess.stderr.on('data', (data) => {
      if (data.toString().includes('Turtle connected')) onReady();
    });
    setTimeout(onReady, 1500);
  }, 6000);
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

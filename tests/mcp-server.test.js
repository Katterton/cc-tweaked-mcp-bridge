import { WebSocket } from 'ws';
import { spawn } from 'child_process';

describe('mcp-server', () => {
  let serverProcess;
  beforeAll(async () => {
    await new Promise((resolve, reject) => {
      serverProcess = spawn('node', ['mcp-server.js']);
      let started = false;
      const onData = (data) => {
        if (data.toString().includes('Turtle connected')) {
          if (!started) {
            started = true;
            serverProcess.stderr.off('data', onData);
            resolve();
          }
        }
      };
      serverProcess.stderr.on('data', onData);
      // timeout fallback
      setTimeout(() => {
        if (!started) {
          serverProcess.stderr.off('data', onData);
          resolve();
        }
      }, 2000);
      serverProcess.on('error', (err) => {
        reject(err);
      });
      serverProcess.on('exit', (code) => {
        if (!started) {
          reject(new Error('Server exited before test start'));
        }
      });
    });
  });
  afterAll(async () => {
    if (serverProcess) {
      serverProcess.kill();
      await new Promise((res) => setTimeout(res, 500));
    }
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

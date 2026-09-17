import { Worker } from "node:worker_threads";

// Run the actual browser worker module on a separate Node thread in tests.
export class TestAnalysisWorker {
  constructor(source = new URL("../../src/offscreen/analysis-worker.js", import.meta.url)) {
    const url = source.href;
    const bridge = `import { parentPort } from 'node:worker_threads';
      globalThis.postMessage = data => parentPort.postMessage(data);
      await import(${JSON.stringify(url)});
      parentPort.on('message', data => globalThis.onmessage({data}));`;
    this.thread = new Worker(new URL(`data:text/javascript,${encodeURIComponent(bridge)}`));
    this.thread.on("message", data => this.onmessage?.({ data }));
    this.thread.on("error", error => this.onerror?.(error));
    this.thread.on("messageerror", error => this.onmessageerror?.(error));
    this.thread.unref();
  }
  postMessage(data, transfers) { this.thread.postMessage(data, transfers); }
  terminate() { void this.thread.terminate(); }
}

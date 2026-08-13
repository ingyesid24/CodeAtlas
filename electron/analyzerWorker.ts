import { parentPort } from 'worker_threads';
import { analyzeProject } from '../src/analyzer';
import type { AnalysisProgress } from '../src/analyzer/types';

interface AnalyzeRequest {
  rootPath: string;
}

if (!parentPort) {
  throw new Error('analyzerWorker debe ejecutarse dentro de un worker_threads.');
}

const port = parentPort;

port.on('message', (payload: AnalyzeRequest) => {
  try {
    const onProgress = (progress: AnalysisProgress) => {
      port.postMessage({ type: 'progress', progress });
    };
    const data = analyzeProject(payload.rootPath, onProgress);
    port.postMessage({ type: 'result', data });
  } catch (error) {
    port.postMessage({
      type: 'error',
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

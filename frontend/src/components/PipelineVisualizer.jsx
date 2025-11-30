import React from 'react';

function Step({ name, status }) {
  const cls = 'step ' + (status === 'done' ? 'done' : status === 'error' ? 'error' : 'pending');
  return (
    <div className={cls}>
      <div className="step-name">{name}</div>
      <div className="step-status">{status}</div>
    </div>
  );
}

export default function PipelineVisualizer({ job, onRefresh }) {
  if (!job) return <div className="muted">Ningún trabajo seleccionado</div>;

  // Try to infer step statuses from job.result, otherwise use high-level status
  const result = job.result || {};
  const stepsArray = Array.isArray(result.steps) ? result.steps : [];
  const getStep = (i) => stepsArray[i] || {};
  const steps = [
    { name: 'Almacenado', status: getStep(0).step === 'upload' ? 'done' : 'pending' },
    { name: 'Generar SAS', status: getStep(1).step === 'generateSAS' ? 'done' : 'pending' },
    { name: 'OCR', status: getStep(2).step === 'ocr' ? (getStep(2).info && getStep(2).info.error ? 'error' : 'done') : (getStep(2).info && getStep(2).info.error ? 'error' : 'pending') },
    { name: 'Traducción', status: getStep(3).step === 'translate' ? 'done' : 'pending' },
    { name: 'Text Analytics', status: getStep(4).step === 'textAnalytics' ? 'done' : 'pending' },
    { name: 'Clasificación', status: getStep(5).step === 'classification' ? 'done' : 'pending' },
  ];

  // Polling: when job is not finished, poll backend for updates every 3s
  React.useEffect(() => {
    let mounted = true;
    if (!job || !onRefresh) return;
    const finished = job.status === 'done' || job.status === 'failed' || job.status === 'completed';
    if (finished) return;
    const id = setInterval(async () => {
      try {
        await onRefresh(job.id);
      } catch (e) { /* ignore */ }
    }, 3000);
    return () => { clearInterval(id); mounted = false; };
  }, [job, onRefresh]);

  return (
    <div className="card pipeline-visualizer">
      <div className="pv-header">
        <h3>Pipeline — {job.id}</h3>
        <div className="pv-actions">
          <button onClick={() => onRefresh && onRefresh(job.id)}>Refrescar</button>
        </div>
      </div>
      <div className="steps">
        {steps.map(s => <Step key={s.name} {...s} />)}
      </div>

      <div className="pv-result">
        <h4>Resumen</h4>
        <div><strong>Estado:</strong> {job.status}</div>
        {result.language && <div><strong>Idioma detectado:</strong> {result.language}</div>}
        {result.translatedText && <div><strong>Texto (es):</strong> <div className="translated-box">{result.translatedText}</div></div>}
      </div>
    </div>
  );
}

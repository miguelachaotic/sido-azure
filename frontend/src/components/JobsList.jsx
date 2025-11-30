import React from 'react';

export default function JobsList({ jobs = [], onSelect, onRefresh }) {
  return (
    <div className="card jobs-list">
      <h3>Trabajos</h3>
      {jobs.length === 0 ? (
        <div className="muted">No hay trabajos aún.</div>
      ) : (
        <ul>
          {jobs.map(job => (
            <li key={job.id} className="job-row">
              <div className="job-meta">
                <strong className="job-id" onClick={() => { if (onSelect) onSelect(job.id); if (onRefresh) onRefresh(job.id); }}>{job.id}</strong>
                <div className="job-status">{job.status || (job.result ? 'done' : 'pending')}</div>
              </div>
              <div className="job-actions">
                <button onClick={() => onSelect && onSelect(job.id)}>Ver</button>
                <button onClick={() => onRefresh && onRefresh(job.id)}>Actualizar</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

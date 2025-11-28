import React, { useState, useEffect } from 'react';
import UploadCard from './components/UploadCard.jsx';
import JobsList from './components/JobsList.jsx';
import PipelineVisualizer from './components/PipelineVisualizer.jsx';
import DetailsDrawer from './components/DetailsDrawer.jsx';
import './styles.css';

export default function App() {
  const [jobs, setJobs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('jobs') || '[]');
    } catch (e) { return [] }
  });
  const [selectedJob, setSelectedJob] = useState(null);

  useEffect(() => { localStorage.setItem('jobs', JSON.stringify(jobs)); }, [jobs]);

  function addJob(job) {
    setJobs(prev => [job, ...prev].slice(0, 20));
    setSelectedJob(job.id);
  }

  async function refreshJob(jobId) {
    try {
      const r = await fetch(`/api/images/status/${jobId}`);
      if (!r.ok) return null;
      const json = await r.json();
      // update jobs list
      setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: json.status, result: json.result } : j));
      return json;
    } catch (e) { console.error(e); return null }
  }

  return (
    <div className="app-root">
      <header className="app-header">
        <h1>OCR Pipeline — Visualizer</h1>
        <div className="header-sub">Upload → OCR → Translate → TextAnalytics → Classification</div>
      </header>
      <main className="app-main">
        <aside className="left-col">
          <UploadCard onJobCreated={addJob} />
          <JobsList jobs={jobs} onSelect={setSelectedJob} onRefresh={refreshJob} />
        </aside>
        <section className="right-col">
          {selectedJob ? (
            <PipelineVisualizer job={jobs.find(j => j.id === selectedJob)} onRefresh={() => refreshJob(selectedJob)} />
          ) : (
            <div className="empty-view">Selecciona o crea un trabajo para ver el pipeline y los resultados.</div>
          )}
        </section>
      </main>
      <DetailsDrawer job={jobs.find(j => j.id === selectedJob)} onClose={() => setSelectedJob(null)} />
    </div>
  );
}

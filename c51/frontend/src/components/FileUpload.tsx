import { useState } from 'react';
import { AlignmentResult } from '../types';

interface FileUploadProps {
  onAlignmentComplete: (result: AlignmentResult) => void;
  isLoading: boolean;
  setIsLoading: (loading: boolean) => void;
  error: string | null;
  setError: (error: string | null) => void;
}

const FileUpload: React.FC<FileUploadProps> = ({
  onAlignmentComplete,
  isLoading,
  setIsLoading,
  error,
  setError
}) => {
  const [referenceFile, setReferenceFile] = useState<File | null>(null);
  const [queryFile, setQueryFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!referenceFile || !queryFile) return;

    setIsLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append('reference', referenceFile);
    formData.append('query', queryFile);

    try {
      const response = await fetch('/api/align', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || 'Alignment failed');
      }

      onAlignmentComplete(data.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <section className="upload-section">
      <h2 style={{ marginBottom: '1.5rem', color: '#00d4ff' }}>Upload Sequences</h2>
      
      {error && (
        <div className="error-message">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="file-input-group">
          <div>
            <label className="file-label">Reference Genome (FASTA)</label>
            <input
              type="file"
              accept=".fasta,.fa,.fna"
              onChange={(e) => setReferenceFile(e.target.files?.[0] || null)}
              className="file-input"
            />
          </div>
          <div>
            <label className="file-label">Query Sequences (FASTQ)</label>
            <input
              type="file"
              accept=".fastq,.fq"
              onChange={(e) => setQueryFile(e.target.files?.[0] || null)}
              className="file-input"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={!referenceFile || !queryFile || isLoading}
          className="align-button"
        >
          {isLoading ? 'Aligning...' : 'Start Alignment'}
        </button>
      </form>
    </section>
  );
};

export default FileUpload;

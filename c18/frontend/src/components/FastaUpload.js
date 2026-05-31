import { useState } from 'react';
import { useMutation } from '@apollo/client';
import { UPLOAD_FASTA } from '../graphql/queries';

function FastaUpload({ onUploadComplete }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const [uploadFasta, { loading }] = useMutation(UPLOAD_FASTA, {
    onCompleted: (data) => {
      if (data.uploadFasta.success) {
        onUploadComplete(data.uploadFasta);
      } else {
        setError(data.uploadFasta.message);
      }
    },
    onError: (err) => {
      setError(`Upload failed: ${err.message}`);
    }
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const validExtensions = ['.fa', '.fasta', '.fas'];
      const isValid = validExtensions.some(ext => file.name.toLowerCase().endsWith(ext));
      
      if (isValid) {
        setSelectedFile(file);
        setError(null);
      } else {
        setError('Please select a valid FASTA file (.fa, .fasta, .fas)');
        setSelectedFile(null);
      }
    }
  };

  const handleUpload = () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    uploadFasta({
      variables: {
        file: selectedFile
      }
    });
  };

  return (
    <div className="upload-section">
      <div className="upload-container">
        <h3>Upload FASTA File</h3>
        <p className="upload-hint">
          Supported formats: .fa, .fasta, .fas
        </p>
        
        <div className="file-input-wrapper">
          <input
            type="file"
            id="fasta-file"
            accept=".fa,.fasta,.fas"
            onChange={handleFileChange}
            className="file-input"
          />
          <label htmlFor="fasta-file" className="file-label">
            {selectedFile ? selectedFile.name : 'Choose a FASTA file'}
          </label>
        </div>

        {selectedFile && (
          <div className="file-info">
            <p><strong>File:</strong> {selectedFile.name}</p>
            <p><strong>Size:</strong> {(selectedFile.size / 1024).toFixed(2)} KB</p>
          </div>
        )}

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <button
          onClick={handleUpload}
          disabled={!selectedFile || loading}
          className="upload-button"
        >
          {loading ? 'Uploading...' : 'Upload and Parse'}
        </button>

        <div className="fasta-example">
          <h4>Example FASTA Format:</h4>
          <pre>{`>gi|12345|ref|NM_001234.1| Example gene sequence
ATGAAGATCAAGATCATCGACTTCTTCAAGAAGGACGCCGCCGTCATCAACG
GTGACATCCACGAGTACAAGGAGTACAAGCCCTGCGCCGAGTACTTCGAGGA
GATCGCCTCCCTCGCGCCATCAG`}</pre>
        </div>
      </div>
    </div>
  );
}

export default FastaUpload;

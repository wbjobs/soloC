import { useState } from 'react';
import './App.css';
import FastaUpload from './components/FastaUpload';
import BlastAnalysis from './components/BlastAnalysis';
import VariantPrediction from './components/VariantPrediction';
import Header from './components/Header';
import Welcome from './components/Welcome';

function App() {
  const [sequences, setSequences] = useState([]);
  const [selectedSequence, setSelectedSequence] = useState(null);
  const [uploadedFileInfo, setUploadedFileInfo] = useState(null);
  const [activeTab, setActiveTab] = useState('upload');

  const handleUploadComplete = (data) => {
    setSequences(data.sequences);
    setUploadedFileInfo({
      count: data.count,
      message: data.message,
      file_path: data.file_path
    });
    if (data.sequences.length > 0) {
      setSelectedSequence(data.sequences[0]);
    }
    setActiveTab('analysis');
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'upload':
        return <FastaUpload onUploadComplete={handleUploadComplete} />;
      case 'analysis':
        return (
          <BlastAnalysis
            sequences={sequences}
            selectedSequence={selectedSequence}
            onSelectSequence={setSelectedSequence}
            uploadedFileInfo={uploadedFileInfo}
          />
        );
      case 'variants':
        return (
          <VariantPrediction
            sequences={sequences}
            selectedSequence={selectedSequence}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div className="App">
      <Header />
      <main className="main-content">
        <Welcome />
        
        <div className="tabs">
          <button 
            className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => setActiveTab('upload')}
          >
            <span className="tab-icon">📄</span>
            Upload FASTA
          </button>
          <button 
            className={`tab-button ${activeTab === 'analysis' ? 'active' : ''}`}
            onClick={() => setActiveTab('analysis')}
            disabled={sequences.length === 0}
          >
            <span className="tab-icon">🔬</span>
            BLAST Analysis
          </button>
          <button 
            className={`tab-button ${activeTab === 'variants' ? 'active' : ''}`}
            onClick={() => setActiveTab('variants')}
            disabled={sequences.length === 0}
          >
            <span className="tab-icon">🧬</span>
            Variant Prediction
          </button>
        </div>

        <div className="tab-content">
          {renderTabContent()}
        </div>
      </main>
      <footer className="footer">
        <p>Gene Sequence Analysis Platform - Powered by BLAST, Graphene & ML-based Variant Prediction</p>
      </footer>
    </div>
  );
}

export default App;

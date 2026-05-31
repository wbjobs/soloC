import { useState } from 'react';
import FileUpload from './components/FileUpload';
import GenomeBrowser from './components/GenomeBrowser';
import { AlignmentResult } from './types';

function App() {
  const [alignmentResult, setAlignmentResult] = useState<AlignmentResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAlignmentComplete = (result: AlignmentResult) => {
    setAlignmentResult(result);
    setError(null);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>🧬 Genome Alignment Browser</h1>
      </header>
      <main className="main">
        <FileUpload
          onAlignmentComplete={handleAlignmentComplete}
          isLoading={isLoading}
          setIsLoading={setIsLoading}
          error={error}
          setError={setError}
        />
        {alignmentResult && (
          <GenomeBrowser alignmentResult={alignmentResult} />
        )}
      </main>
    </div>
  );
}

export default App;

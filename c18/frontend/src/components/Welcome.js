function Welcome() {
  return (
    <section className="welcome-section">
      <h2>Welcome to Gene Sequence Analysis</h2>
      <p>
        This platform allows you to upload FASTA files containing gene sequences and
        perform BLAST (Basic Local Alignment Search Tool) searches to find homologous
        sequences in biological databases.
      </p>
      <div className="features">
        <div className="feature">
          <div className="feature-icon">📄</div>
          <h3>FASTA Upload</h3>
          <p>Upload FASTA files (.fa, .fasta, .fas) containing your gene sequences</p>
        </div>
        <div className="feature">
          <div className="feature-icon">🔬</div>
          <h3>BLAST Analysis</h3>
          <p>Search nucleotide and protein databases using NCBI's BLAST algorithms</p>
        </div>
        <div className="feature">
          <div className="feature-icon">📊</div>
          <h3>Detailed Results</h3>
          <p>View alignment scores, E-values, and sequence identities</p>
        </div>
      </div>
    </section>
  );
}

export default Welcome;

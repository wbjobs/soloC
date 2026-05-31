'use client';

import { useState } from 'react';
import { ApolloClient, InMemoryCache, gql, useLazyQuery } from '@apollo/client';
import dynamic from 'next/dynamic';

const ForceGraph = dynamic(() => import('../components/ForceGraph'), { ssr: false });

const client = new ApolloClient({
  uri: 'http://localhost:8000/graphql',
  cache: new InMemoryCache(),
});

const SEARCH_PAPERS = gql`
  query SearchPapers($query: String!, $limit: Int!) {
    searchPapers(query: $query, limit: $limit) {
      id
      title
      abstract
      published
    }
  }
`;

const GET_PAPER = gql`
  query GetPaper($paperId: String!) {
    getPaper(paperId: $paperId) {
      paper {
        id
        title
      }
      authors {
        id
        name
      }
      citations {
        id
        title
      }
      references {
        id
        title
      }
    }
  }
`;

const GET_RECOMMENDATIONS = gql`
  query GetRecommendations($paperId: String!, $limit: Int!) {
    getRecommendations(paperId: $paperId, limit: $limit) {
      paper {
        id
        title
        abstract
        published
      }
      score
      recommendationType
    }
  }
`;

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPaper, setSelectedPaper] = useState<any>(null);
  const [graphData, setGraphData] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [showRecommendations, setShowRecommendations] = useState(false);

  const [searchPapers, { loading, data }] = useLazyQuery(SEARCH_PAPERS, {
    client,
  });

  const [getPaper] = useLazyQuery(GET_PAPER, {
    client,
    onCompleted: (data) => {
      if (data.getPaper) {
        const nodes: any[] = [];
        const links: any[] = [];
        const paper = data.getPaper.paper;
        const authors = data.getPaper.authors;
        const citations = data.getPaper.citations;
        const references = data.getPaper.references;

        nodes.push({ id: paper.id, name: paper.title, type: 'paper', isMain: true });

        authors.forEach((author: any) => {
          nodes.push({ id: author.id, name: author.name, type: 'author' });
          links.push({ source: author.id, target: paper.id });
        });

        citations.forEach((cited: any) => {
          nodes.push({ id: cited.id, name: cited.title, type: 'paper' });
          links.push({ source: paper.id, target: cited.id });
        });

        references.forEach((citing: any) => {
          const exists = nodes.find(n => n.id === citing.id);
          if (!exists) {
            nodes.push({ id: citing.id, name: citing.title, type: 'paper' });
          }
          links.push({ source: citing.id, target: paper.id });
        });

        setGraphData({ nodes, links });
      }
    },
  });

  const [getRecommendations, { loading: recLoading, data: recData }] = useLazyQuery(GET_RECOMMENDATIONS, {
    client,
  });

  const handleSearch = () => {
    if (searchQuery.trim()) {
      searchPapers({ variables: { query: searchQuery, limit: 20 } });
    }
  };

  const handlePaperClick = (paper: any) => {
    setSelectedPaper(paper);
    getPaper({ variables: { paperId: paper.id } });
    setShowRecommendations(false);
  };

  const handleGetRecommendations = () => {
    if (selectedPaper) {
      getRecommendations({ variables: { paperId: selectedPaper.id, limit: 10 } });
      setShowRecommendations(true);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  return (
    <div className="container">
      <div className="header">
        <h1>Academic Knowledge Graph</h1>
        <p>Explore papers, authors, and their relationships</p>
      </div>

      <div className="search-section">
        <input
          type="text"
          className="search-input"
          placeholder="Search papers by title or abstract..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyPress={handleKeyPress}
        />
        <button className="search-button" onClick={handleSearch}>
          Search Papers
        </button>
      </div>

      <div className="results-section">
        <div className="paper-list">
          <h2>Search Results</h2>
          {loading && <div className="loading">Searching...</div>}
          {!loading && !data?.searchPapers?.length && (
            <div className="no-results">No results found. Try searching for "machine learning" or "neural networks"</div>
          )}
          {data?.searchPapers?.map((paper: any) => (
            <div
              key={paper.id}
              className={`paper-card ${selectedPaper?.id === paper.id ? 'selected' : ''}`}
              onClick={() => handlePaperClick(paper)}
            >
              <h3>{paper.title}</h3>
              <div className="date">
                {paper.published ? new Date(paper.published).toLocaleDateString() : 'Unknown date'}
              </div>
            </div>
          ))}
        </div>

        <div className="graph-container">
          <h2>Knowledge Graph</h2>
          {selectedPaper && (
            <div style={{ marginBottom: '15px' }}>
              <button
                className="search-button"
                style={{ margin: 0, padding: '10px 20px', fontSize: '14px' }}
                onClick={handleGetRecommendations}
              >
                🔍 Get Similar Paper Recommendations
              </button>
            </div>
          )}
          {graphData.nodes.length > 0 ? (
            <>
              <div className="info">
                Selected: {selectedPaper?.title}
              </div>
              <ForceGraph nodes={graphData.nodes} links={graphData.links} />
            </>
          ) : (
            <div className="empty-state">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M12 2v4m0 12v4M2 12h4m12 0h4" />
                <circle cx="18.36" cy="5.64" r="1" />
                <circle cx="5.64" cy="18.36" r="1" />
                <circle cx="5.64" cy="5.64" r="1" />
                <circle cx="18.36" cy="18.36" r="1" />
              </svg>
              <p>Click on a paper to view its knowledge graph</p>
            </div>
          )}
        </div>
      </div>

      {showRecommendations && (
        <div className="recommendation-section" style={{ marginTop: '30px', background: 'white', borderRadius: '16px', padding: '25px', boxShadow: '0 10px 40px rgba(0,0,0,0.1)' }}>
          <h2 style={{ marginBottom: '20px', color: '#333' }}>📊 Recommended Papers</h2>
          {recLoading && <div className="loading" style={{ textAlign: 'center', padding: '40px' }}>Calculating recommendations...</div>}
          {!recLoading && !recData?.getRecommendations?.length && (
            <div className="no-results" style={{ textAlign: 'center', padding: '40px', color: '#999' }}>
              No recommendations found. The paper may not have enough connections in the knowledge graph.
            </div>
          )}
          {!recLoading && recData?.getRecommendations?.length > 0 && (
            <div style={{ display: 'grid', gap: '15px' }}>
              {recData.getRecommendations.map((rec: any, index: number) => (
                <div
                  key={rec.paper.id}
                  style={{
                    padding: '20px',
                    border: '1px solid #e8e8e8',
                    borderRadius: '12px',
                    cursor: 'pointer',
                    transition: 'all 0.3s',
                    background: index === 0 ? 'linear-gradient(135deg, #f8f9ff 0%, #e8f4ff 100%)' : 'white',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = '#667eea';
                    e.currentTarget.style.boxShadow = '0 4px 15px rgba(102, 126, 234, 0.15)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#e8e8e8';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  onClick={() => handlePaperClick(rec.paper)}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '15px' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                        <span style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: 'white',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                        }}>
                          #{index + 1}
                        </span>
                        <h3 style={{ margin: 0, color: '#333', fontSize: '1rem', lineHeight: 1.4 }}>{rec.paper.title}</h3>
                      </div>
                      <div style={{ color: '#666', fontSize: '0.85rem', marginBottom: '8px' }}>
                        {rec.paper.abstract && rec.paper.abstract.length > 200
                          ? rec.paper.abstract.substring(0, 200) + '...'
                          : rec.paper.abstract}
                      </div>
                      <div style={{ color: '#999', fontSize: '0.8rem' }}>
                        {rec.paper.published ? new Date(rec.paper.published).toLocaleDateString() : 'Unknown date'}
                      </div>
                    </div>
                    <div style={{
                      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                      color: 'white',
                      padding: '10px 15px',
                      borderRadius: '10px',
                      textAlign: 'center',
                      minWidth: '80px',
                    }}>
                      <div style={{ fontSize: '0.75rem', opacity: 0.9 }}>Score</div>
                      <div style={{ fontSize: '1.2rem', fontWeight: 'bold' }}>
                        {rec.score.toFixed(3)}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

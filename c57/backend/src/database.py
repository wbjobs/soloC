import os
from neo4j import GraphDatabase
from dotenv import load_dotenv

load_dotenv()

class Neo4jDatabase:
    def __init__(self):
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "password")
        self.driver = None

    def connect(self):
        self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))

    def close(self):
        if self.driver:
            self.driver.close()

    def create_constraints(self):
        with self.driver.session() as session:
            session.run("CREATE CONSTRAINT paper_id IF NOT EXISTS FOR (p:Paper) REQUIRE p.id IS UNIQUE")
            session.run("CREATE CONSTRAINT author_id IF NOT EXISTS FOR (a:Author) REQUIRE a.id IS UNIQUE")
            session.run("CREATE CONSTRAINT institution_id IF NOT EXISTS FOR (i:Institution) REQUIRE i.id IS UNIQUE")

    def execute_query(self, query, parameters=None):
        with self.driver.session() as session:
            result = session.run(query, parameters or {})
            return [dict(record) for record in result]

    def personalized_pagerank_recommendations(self, paper_id: str, top_k: int = 10):
        query = """
        MATCH (source:Paper {id: $paper_id})
        CALL gds.pageRank.stream({
            nodeProjection: {
                Paper: {properties: {}},
                Author: {properties: {}}
            },
            relationshipProjection: {
                AUTHORED: {
                    type: 'AUTHORED',
                    orientation: 'UNDIRECTED'
                },
                CITES: {
                    type: 'CITES',
                    orientation: 'NATURAL'
                }
            },
            sourceNodes: [source],
            relationshipWeightProperty: null,
            dampingFactor: 0.85,
            maxIterations: 20,
            tolerance: 0.0001
        })
        YIELD nodeId, score
        WITH gds.util.asNode(nodeId) AS node, score
        WHERE node:Paper AND node.id <> $paper_id
        RETURN node {.id, .title, .abstract, .published, .doi, .pdf_url, categories: COALESCE(node.categories, [])} AS paper, score
        ORDER BY score DESC
        LIMIT $top_k
        """
        try:
            return self.execute_query(query, {"paper_id": paper_id, "top_k": top_k})
        except Exception as e:
            print(f"Personalized PageRank failed, falling back to common authors: {e}")
            return self.common_authors_recommendations(paper_id, top_k)

    def common_authors_recommendations(self, paper_id: str, top_k: int = 10):
        query = """
        MATCH (source:Paper {id: $paper_id})<-[:AUTHORED]-(a:Author)-[:AUTHORED]->(other:Paper)
        WHERE source <> other
        WITH other, COUNT(DISTINCT a) AS sharedAuthors
        RETURN other {.id, .title, .abstract, .published, .doi, .pdf_url, categories: COALESCE(other.categories, [])} AS paper, 
               sharedAuthors AS score
        ORDER BY score DESC
        LIMIT $top_k
        """
        return self.execute_query(query, {"paper_id": paper_id, "top_k": top_k})

    def citation_based_recommendations(self, paper_id: str, top_k: int = 10):
        query = """
        MATCH (source:Paper {id: $paper_id})
        OPTIONAL MATCH (source)-[:CITES]->(cited:Paper)
        OPTIONAL MATCH (citing:Paper)-[:CITES]->(source)
        WITH COLLECT(DISTINCT cited) + COLLECT(DISTINCT citing) AS directConnections
        UNWIND directConnections AS connected
        WITH COLLECT(DISTINCT connected) AS connectedPapers
        UNWIND connectedPapers AS cp
        MATCH (cp)-[:CITES|:CITES*1..2]-(rec:Paper)
        WHERE rec.id <> $paper_id AND NOT rec IN connectedPapers
        WITH rec, COUNT(*) AS connectionStrength
        RETURN rec {.id, .title, .abstract, .published, .doi, .pdf_url, categories: COALESCE(rec.categories, [])} AS paper, 
               connectionStrength AS score
        ORDER BY score DESC
        LIMIT $top_k
        """
        return self.execute_query(query, {"paper_id": paper_id, "top_k": top_k})

    def graph_based_recommendations(self, paper_id: str, top_k: int = 10):
        query = """
        MATCH (source:Paper {id: $paper_id})
        MATCH (source)-[:AUTHORED*0..1]-(a:Author)
        MATCH (a)-[:AUTHORED]-(other:Paper)
        WHERE other.id <> $paper_id
        WITH other, COUNT(DISTINCT a) AS authorConnections
        
        OPTIONAL MATCH (source)-[:CITES]->(cited:Paper)<-[:CITES]-(other)
        WITH other, authorConnections, COUNT(DISTINCT cited) AS coCited
        
        OPTIONAL MATCH (citing:Paper)-[:CITES]->(source)
        OPTIONAL MATCH (citing)-[:CITES]->(other)
        WITH other, authorConnections, coCited, COUNT(DISTINCT citing) AS sameCiting
        
        WITH other, 
             authorConnections * 0.5 + coCited * 0.3 + sameCiting * 0.2 AS score
        WHERE score > 0
        RETURN other {.id, .title, .abstract, .published, .doi, .pdf_url, categories: COALESCE(other.categories, [])} AS paper, 
               score
        ORDER BY score DESC
        LIMIT $top_k
        """
        return self.execute_query(query, {"paper_id": paper_id, "top_k": top_k})

    def hybrid_recommendations(self, paper_id: str, top_k: int = 10):
        query = """
        MATCH (source:Paper {id: $paper_id})
        
        CALL gds.pageRank.stream({
            nodeProjection: {
                Paper: {properties: {}},
                Author: {properties: {}}
            },
            relationshipProjection: {
                AUTHORED: {
                    type: 'AUTHORED',
                    orientation: 'UNDIRECTED'
                }
            },
            sourceNodes: [source],
            dampingFactor: 0.85,
            maxIterations: 20
        })
        YIELD nodeId, score
        WITH gds.util.asNode(nodeId) AS node, score AS prScore
        WHERE node:Paper AND node.id <> $paper_id
        
        OPTIONAL MATCH (source)<-[:AUTHORED]-(a:Author)-[:AUTHORED]->(node)
        WITH node, prScore, COUNT(DISTINCT a) AS authorOverlap
        
        RETURN node {.id, .title, .abstract, .published, .doi, .pdf_url, categories: COALESCE(node.categories, [])} AS paper,
               prScore * 0.7 + authorOverlap * 0.3 AS score
        ORDER BY score DESC
        LIMIT $top_k
        """
        try:
            return self.execute_query(query, {"paper_id": paper_id, "top_k": top_k})
        except Exception as e:
            print(f"Hybrid recommendation failed, falling back to graph-based: {e}")
            return self.graph_based_recommendations(paper_id, top_k)

db = Neo4jDatabase()


import strawberry
from typing import List, Optional
from database import db

@strawberry.type
class Author:
    id: str
    name: str

@strawberry.type
class Paper:
    id: str
    title: str
    abstract: Optional[str]
    published: Optional[str]
    updated: Optional[str]
    doi: Optional[str]
    pdf_url: Optional[str]
    categories: Optional[List[str]]

@strawberry.type
class PaperWithRelations:
    paper: Paper
    authors: List[Author]
    citations: List[Paper]
    references: List[Paper]

@strawberry.type
class AuthorNetwork:
    author: Author
    co_authors: List[Author]

@strawberry.type
class RecommendedPaper:
    paper: Paper
    score: float
    recommendation_type: str

@strawberry.type
class Query:
    @strawberry.field
    def search_papers(self, query: str, limit: int = 10) -> List[Paper]:
        cypher = """
        MATCH (p:Paper)
        WHERE p.title CONTAINS $query OR p.abstract CONTAINS $query
        RETURN p
        LIMIT $limit
        """
        results = db.execute_query(cypher, {"query": query, "limit": limit})
        return [Paper(**dict(r["p"])) for r in results]

    @strawberry.field
    def get_paper(self, paper_id: str) -> Optional[PaperWithRelations]:
        paper_query = """
        MATCH (p:Paper {id: $paper_id})
        OPTIONAL MATCH (a:Author)-[:AUTHORED]->(p)
        OPTIONAL MATCH (p)-[:CITES]->(cited:Paper)
        OPTIONAL MATCH (citing:Paper)-[:CITES]->(p)
        RETURN p, COLLECT(DISTINCT a) as authors, 
               COLLECT(DISTINCT cited) as citations,
               COLLECT(DISTINCT citing) as references
        """
        result = db.execute_query(paper_query, {"paper_id": paper_id})
        if not result:
            return None
        r = result[0]
        return PaperWithRelations(
            paper=Paper(**dict(r["p"])),
            authors=[Author(**dict(a)) for a in r["authors"]],
            citations=[Paper(**dict(c)) for c in r["citations"]],
            references=[Paper(**dict(r)) for r in r["references"]]
        )

    @strawberry.field
    def get_author_network(self, author_id: str) -> Optional[AuthorNetwork]:
        query = """
        MATCH (a:Author {id: $author_id})
        OPTIONAL MATCH (a)-[:AUTHORED]->(:Paper)<-[:AUTHORED]-(co:Author)
        WHERE co.id <> $author_id
        RETURN a, COLLECT(DISTINCT co) as co_authors
        """
        result = db.execute_query(query, {"author_id": author_id})
        if not result:
            return None
        r = result[0]
        return AuthorNetwork(
            author=Author(**dict(r["a"])),
            co_authors=[Author(**dict(co)) for co in r["co_authors"]]
        )

    @strawberry.field
    def get_recommendations(self, paper_id: str, limit: int = 10) -> List[RecommendedPaper]:
        results = db.graph_based_recommendations(paper_id, limit)
        if not results:
            return []
        return [
            RecommendedPaper(
                paper=Paper(**r["paper"]),
                score=float(r["score"]),
                recommendation_type="graph_based"
            )
            for r in results
        ]

    @strawberry.field
    def get_hybrid_recommendations(self, paper_id: str, limit: int = 10) -> List[RecommendedPaper]:
        results = db.hybrid_recommendations(paper_id, limit)
        if not results:
            return []
        return [
            RecommendedPaper(
                paper=Paper(**r["paper"]),
                score=float(r["score"]),
                recommendation_type="hybrid"
            )
            for r in results
        ]

schema = strawberry.Schema(query=Query)

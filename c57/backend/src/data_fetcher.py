import arxiv
import uuid
from typing import List, Dict
from database import db

class PaperFetcher:
    def __init__(self):
        self.client = arxiv.Client()

    def search_papers(self, query: str, max_results: int = 10) -> List[Dict]:
        search = arxiv.Search(
            query=query,
            max_results=max_results,
            sort_by=arxiv.SortCriterion.Relevance
        )
        papers = []
        for result in self.client.results(search):
            paper = {
                "id": result.entry_id.split("/")[-1],
                "title": result.title,
                "abstract": result.summary,
                "authors": [author.name for author in result.authors],
                "categories": result.categories,
                "published": result.published.isoformat(),
                "updated": result.updated.isoformat(),
                "doi": result.doi,
                "pdf_url": result.pdf_url
            }
            papers.append(paper)
        return papers

    def save_to_neo4j(self, papers: List[Dict]):
        for paper in papers:
            self._create_paper_node(paper)
            self._create_author_nodes(paper)
            self._create_citation_relations(paper)

    def _create_paper_node(self, paper: Dict):
        query = """
        MERGE (p:Paper {id: $id})
        SET p.title = $title,
            p.abstract = $abstract,
            p.published = $published,
            p.updated = $updated,
            p.doi = $doi,
            p.pdf_url = $pdf_url,
            p.categories = $categories
        RETURN p
        """
        db.execute_query(query, paper)

    def _create_author_nodes(self, paper: Dict):
        for author_name in paper["authors"]:
            author_id = str(uuid.uuid5(uuid.NAMESPACE_DNS, author_name))
            query = """
            MERGE (a:Author {id: $author_id})
            SET a.name = $name
            WITH a
            MATCH (p:Paper {id: $paper_id})
            MERGE (a)-[:AUTHORED]->(p)
            """
            db.execute_query(query, {
                "author_id": author_id,
                "name": author_name,
                "paper_id": paper["id"]
            })

    def _create_citation_relations(self, paper: Dict):
        pass

fetcher = PaperFetcher()

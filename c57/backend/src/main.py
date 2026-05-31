from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from strawberry.fastapi import GraphQLRouter
from contextlib import asynccontextmanager
from database import db
from graphql_schema import schema
from data_fetcher import fetcher

@asynccontextmanager
async def lifespan(app: FastAPI):
    db.connect()
    db.create_constraints()
    yield
    db.close()

app = FastAPI(title="Academic Knowledge Graph API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

graphql_app = GraphQLRouter(schema)
app.include_router(graphql_app, prefix="/graphql")

@app.get("/")
async def root():
    return {"message": "Academic Knowledge Graph API"}

@app.get("/fetch-papers")
async def fetch_papers(query: str = "machine learning", max_results: int = 10):
    papers = fetcher.search_papers(query, max_results)
    fetcher.save_to_neo4j(papers)
    return {"fetched": len(papers), "papers": papers}

@app.get("/health")
async def health():
    return {"status": "healthy"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

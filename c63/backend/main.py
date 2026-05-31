from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from metabolic_network import MetabolicNetwork
from typing import List

app = FastAPI(title="Metabolic Network API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

network = MetabolicNetwork()


class PathQuery(BaseModel):
    source: str
    target: str


class FBAQuery(BaseModel):
    knockout_genes: List[str] = []


@app.get("/")
async def root():
    return {"message": "Metabolic Network API is running"}


@app.get("/stats")
async def get_stats():
    return network.get_network_stats()


@app.get("/nodes")
async def get_nodes():
    return {"nodes": network.get_all_nodes()}


@app.get("/edges")
async def get_edges():
    return {"edges": network.get_all_edges()}


@app.get("/metabolites")
async def get_metabolites():
    return {"metabolites": network.get_metabolite_list()}


@app.get("/genes")
async def get_genes():
    return {"genes": network.get_gene_list()}


@app.get("/network")
async def get_network():
    return {
        "nodes": network.get_all_nodes(),
        "edges": network.get_all_edges(),
    }


@app.post("/find-path")
async def find_path(query: PathQuery):
    result = network.find_shortest_path(query.source, query.target)
    if not result["success"]:
        raise HTTPException(status_code=404, detail=result["error"])
    return result


@app.post("/run-fba")
async def run_fba(query: FBAQuery):
    result = network.run_fba(query.knockout_genes)
    if not result["success"]:
        raise HTTPException(status_code=400, detail=result["error"])
    return result


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

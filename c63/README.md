# Metabolic Network Visualizer

A full-stack scientific computing tool for visualizing and analyzing microbial metabolic networks.

## Features

- **Backend**: Python + FastAPI + NetworkX + COBRApy
- **Frontend**: Next.js + 3D Force Graph + Three.js
- **Dataset**: E. coli core metabolic network
- **3D Visualization**: Interactive force-directed graph visualization
- **Path Finding**: Shortest path query between metabolites
- **Path Highlighting**: Visualize paths and chemical reactions

## Project Structure

```
c63/
├── backend/
│   ├── main.py              # FastAPI server
│   ├── metabolic_network.py  # Metabolic network logic
│   └── requirements.txt     # Python dependencies
└── frontend/
    ├── app/
    │   ├── page.tsx        # Main page
    │   ├── layout.tsx      # Layout
    │   └── globals.css     # Styles
    ├── components/
    │   └── ForceGraph3D.tsx # 3D graph component
    ├── services/
    │   └── api.ts          # API client
    └── package.json          # Node.js dependencies
```

## Setup Instructions

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Create a virtual environment (optional but recommended):
```bash
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate  # Linux/Mac
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Run the FastAPI server:
```bash
python main.py
```

The backend server will start at `http://localhost:8000`

API documentation is available at `http://localhost:8000/docs`

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

The frontend will be available at `http://localhost:3000`

## Usage

1. Start both backend and frontend servers.

2. Open your browser and navigate to `http://localhost:3000`.

3. **3D Graph Controls:**
   - Left click + drag: Rotate
   - Right click + drag: Pan
   - Scroll: Zoom in/out
   - Click on nodes: Select

4. **Find Shortest Path:**
   - Click on two nodes to select them
   - Click "Find Shortest Path" button
   - The path will be highlighted in green with yellow edges
   - Chemical reactions in the path will be displayed in the sidebar

## Node Types

- 🔵 **Blue**: Metabolites
- 🔴 **Red**: Reactions
- 🟢 **Green**: Genes
- 🟥 **Dark Red**: Selected nodes
- 🟩 **Bright Green**: Nodes in the found path
- 🟨 **Yellow**: Path edges

## API Endpoints

- `GET /`: Welcome message
- `GET /stats`: Network statistics
- `GET /nodes`: List all nodes
- `GET /edges`: List all edges
- `GET /network`: Complete network data (nodes + edges)
- `GET /metabolites`: List all metabolites
- `POST /find-path`: Find shortest path between two nodes
  - Body: `{ "source": "node_id", "target": "node_id" }`

## Example Metabolite IDs

Try these metabolites for testing:
- `glc__D_e` - D-Glucose
- `ac_e` - Acetate
- `pyr_e` - Pyruvate
- `o2_e` - Oxygen
- `co2_e` - CO2
- `h2o_e` - H2O
- `atp` - ATP
- `nad` - NAD+

## Technologies

### Backend
- FastAPI: Web framework for building APIs
- NetworkX: Graph library for path finding
- COBRApy: Metabolic network modeling
- Uvicorn: ASGI server

### Frontend
- Next.js 14: React framework
- 3D Force Graph: 3D network visualization
- Three.js: 3D graphics library
- Tailwind CSS: Styling
- TypeScript: Type safety

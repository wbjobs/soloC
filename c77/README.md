# Protein MD Simulator

A scientific desktop application for protein molecular dynamics simulation with 3D visualization.

## Features

- **Protein Input**: PDB ID download or local PDB file upload
- **Molecular Dynamics**: 100ns simulation with OpenMM using implicit solvent model (OBC2)
- **3D Visualization**: Real-time protein structure rendering with Three.js
- **Live Metrics**: 
  - Potential energy curve
  - RMSD (Root Mean Square Deviation)
  - Radius of Gyration
- **Data Export**: Download trajectory as DCD file and snapshot as PNG

## Tech Stack

- **Frontend**: Electron + Three.js + Chart.js
- **Backend**: Python + Flask + OpenMM
- **Force Field**: AMBER14 with implicit solvent (OBC2)

## Installation

### Prerequisites

1. **Node.js** (v16 or higher)
2. **Python** (3.8 or higher)
3. **OpenMM** - Molecular dynamics engine

### Step 1: Install Python Dependencies

```bash
pip install -r requirements.txt
```

Or install OpenMM via conda (recommended):
```bash
conda install -c conda-forge openmm pdbfixer
pip install flask flask-cors numpy
```

### Step 2: Install Node.js Dependencies

```bash
npm install
```

## Running the Application

```bash
npm start
```

For development mode (with DevTools):
```bash
npm run dev
```

## Usage

1. **Input Protein Structure**:
   - Enter a PDB ID (e.g., 1AKI) and click "Start Simulation"
   - OR click to upload a local PDB file

2. **Simulation Process**:
   - The app will prepare the system and run energy minimization
   - Molecular dynamics simulation will run for 100ns
   - Real-time status shows progress, energy, RMSD, and radius of gyration

3. **3D View Controls**:
   - Drag to rotate the protein
   - Scroll to zoom in/out

4. **Download Results**:
   - Click "Download DCD" to save the trajectory file
   - Click "Snapshot PNG" to save current 3D view

## Project Structure

```
protein-md-simulator/
├── src/
│   ├── main.js              # Electron main process
│   └── renderer/
│       ├── index.html       # UI interface
│       └── app.js           # Frontend logic + Three.js rendering
├── backend/
│   └── server.py            # Flask server + OpenMM simulation
├── package.json             # Node.js dependencies
├── requirements.txt         # Python dependencies
└── README.md
```

## Simulation Details

- **Time step**: 2 fs
- **Temperature**: 300 K (Langevin thermostat)
- **Total simulation time**: 100 ns (50,000,000 steps)
- **Solvent**: Implicit OBC2 model
- **Constraints**: Hydrogen bonds constrained
- **Report interval**: Every 1000 steps for status updates

## Troubleshooting

### OpenMM not found
- Install via conda: `conda install -c conda-forge openmm`
- Or use pip: `pip install openmm`

### Python server fails to start
- Check port 5000 is available
- Verify all Python dependencies are installed

### 3D view not rendering
- Ensure WebGL is enabled in your system
- Check browser/electron console for errors

## License

MIT License

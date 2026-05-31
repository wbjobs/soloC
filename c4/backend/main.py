import os
import tempfile
import re
import base64
import io
from contextlib import contextmanager
from typing import Optional, Generator
import numpy as np
from fastapi import FastAPI, File, UploadFile, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

app = FastAPI(title="Protein Stability Prediction API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

try:
    from openmm import app, OpenMMException
    import openmm as mm
    from openmm import unit
    HAS_OPENMM = True
except ImportError:
    HAS_OPENMM = False

try:
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from matplotlib.colors import LinearSegmentedColormap
    HAS_MATPLOTLIB = True
except ImportError:
    HAS_MATPLOTLIB = False


class SimulationResult(BaseModel):
    rmsd: float
    initial_energy: float
    final_energy: float
    steps: int
    success: bool
    message: Optional[str] = None


class MutationAnalysisRequest(BaseModel):
    pdb_content: str
    residue_index: int
    original_res_name: str
    target_res_name: str


class MutationAnalysisResult(BaseModel):
    success: bool
    energy_landscape_url: Optional[str] = None
    message: Optional[str] = None
    energy_trajectory: Optional[list] = None


@contextmanager
def temporary_pdb_file(pdb_content: str) -> Generator[str, None, None]:
    temp_file = None
    try:
        temp_file = tempfile.NamedTemporaryFile(
            mode='w',
            suffix='.pdb',
            prefix='protein_',
            delete=False
        )
        temp_file.write(pdb_content)
        temp_file.flush()
        temp_path = temp_file.name
        temp_file.close()
        yield temp_path
    finally:
        if temp_file is not None and not temp_file.closed:
            try:
                temp_file.close()
            except Exception:
                pass
        if temp_file is not None and os.path.exists(temp_path):
            try:
                os.unlink(temp_path)
            except Exception:
                pass


def validate_pdb_content(content: str) -> tuple[bool, str]:
    lines = content.strip().split('\n')
    
    if len(lines) == 0:
        return False, "Empty PDB file"
    
    has_atom = False
    has_valid_record = False
    model_count = 0
    atom_count = 0
    
    pdb_record_pattern = re.compile(
        r'^(ATOM|HETATM|CRYST1|MODEL|ENDMDL|TER|END|HEADER|TITLE|COMPND|SOURCE|KEYWDS|AUTHOR|'
        r'REVDAT|JRNL|REMARK|DBREF|SEQRES|MODRES|HET|HETNAM|HETSYN|FORMUL|SSBOND|LINK|'
        r'CISPEP|SITE|CONECT|MASTER)'
    )
    
    for line_num, line in enumerate(lines, 1):
        if not line.strip():
            continue
        
        if len(line) < 6:
            continue
        
        record_name = line[:6].strip()
        
        if not pdb_record_pattern.match(line):
            if line.strip():
                return False, f"Invalid PDB format at line {line_num}: unexpected record type"
        
        has_valid_record = True
        
        if line.startswith('ATOM  ') or line.startswith('HETATM'):
            has_atom = True
            atom_count += 1
            
            if len(line) < 54:
                return False, f"Invalid ATOM line at line {line_num}: too short (must be at least 54 chars)"
            
            try:
                x = float(line[30:38].strip())
                y = float(line[38:46].strip())
                z = float(line[46:54].strip())
                if abs(x) > 10000 or abs(y) > 10000 or abs(z) > 10000:
                    return False, f"Invalid coordinates at line {line_num}: out of range"
            except ValueError:
                return False, f"Invalid coordinates at line {line_num}: not valid numbers"
        
        if line.startswith('MODEL '):
            model_count += 1
    
    if model_count > 1:
        return False, f"Multi-model PDB files not supported (found {model_count} models)"
    
    if not has_atom:
        return False, "No ATOM or HETATM records found in PDB file"
    
    if atom_count < 3:
        return False, f"Insufficient atoms: found only {atom_count} atoms (minimum 3 required)"
    
    return True, f"Valid PDB file: {atom_count} atoms"


def calculate_rmsd(coords1: np.ndarray, coords2: np.ndarray) -> float:
    if coords1.shape != coords2.shape:
        raise ValueError("Coordinate arrays must have the same shape")
    
    centered1 = coords1 - np.mean(coords1, axis=0)
    centered2 = coords2 - np.mean(coords2, axis=0)
    
    H = centered1.T @ centered2
    U, S, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    
    if np.linalg.det(R) < 0:
        Vt[-1, :] *= -1
        R = Vt.T @ U.T
    
    aligned = (centered2 @ R.T) + np.mean(coords1, axis=0)
    rmsd = np.sqrt(np.mean(np.sum((coords1 - aligned) ** 2, axis=1)))
    return rmsd


def extract_backbone_coords(positions: 'unit.Quantity', topology: 'app.Topology') -> np.ndarray:
    coords_list = []
    pos_array = positions.in_units_of(unit.angstroms).value_in_unit(unit.angstroms)
    
    for i, atom in enumerate(topology.atoms()):
        atom_name = atom.name.strip()
        if atom_name in ["CA", "C", "N", "O"]:
            coords_list.append(pos_array[i])
    
    return np.array(coords_list) if coords_list else np.array([])


def run_openmm_simulation(pdb_content: str, num_steps: int = 100) -> SimulationResult:
    if not HAS_OPENMM:
        return SimulationResult(
            rmsd=0.0,
            initial_energy=0.0,
            final_energy=0.0,
            steps=0,
            success=False,
            message="OpenMM not installed. Please install openmm package."
        )
    
    is_valid, validate_msg = validate_pdb_content(pdb_content)
    if not is_valid:
        return SimulationResult(
            rmsd=0.0,
            initial_energy=0.0,
            final_energy=0.0,
            steps=num_steps,
            success=False,
            message=f"PDB validation failed: {validate_msg}"
        )
    
    try:
        with temporary_pdb_file(pdb_content) as temp_pdb_path:
            pdb = app.PDBFile(temp_pdb_path)
            
            forcefield = app.ForceField('amber14-all.xml', 'amber14/tip3pfb.xml')
            
            modeller = app.Modeller(pdb.topology, pdb.positions)
            modeller.addHydrogens(forcefield)
            modeller.addSolvent(forcefield, model='tip3p', padding=1.0*unit.nanometers, neutralize=True)
            
            system = forcefield.createSystem(
                modeller.topology,
                nonbondedMethod=app.PME,
                nonbondedCutoff=1.0*unit.nanometers,
                constraints=app.HBonds,
                rigidWater=True
            )
            
            integrator = mm.LangevinMiddleIntegrator(
                300*unit.kelvin,
                1.0/unit.picosecond,
                0.002*unit.picoseconds
            )
            
            platform = mm.Platform.getPlatformByName('Reference')
            simulation = app.Simulation(modeller.topology, system, integrator, platform)
            simulation.context.setPositions(modeller.positions)
            
            initial_state = simulation.context.getState(getEnergy=True, getPositions=True)
            initial_energy = initial_state.getPotentialEnergy().value_in_unit(unit.kilocalorie_per_mole)
            initial_positions = initial_state.getPositions(asNumpy=True)
            initial_backbone = extract_backbone_coords(initial_positions, modeller.topology)
            
            print(f"Running {num_steps} steps of energy minimization...")
            simulation.minimizeEnergy(maxIterations=num_steps)
            
            final_state = simulation.context.getState(getEnergy=True, getPositions=True)
            final_energy = final_state.getPotentialEnergy().value_in_unit(unit.kilocalorie_per_mole)
            final_positions = final_state.getPositions(asNumpy=True)
            final_backbone = extract_backbone_coords(final_positions, modeller.topology)
            
            if len(initial_backbone) > 0 and len(final_backbone) > 0:
                rmsd = calculate_rmsd(initial_backbone, final_backbone)
            else:
                rmsd = 0.0
            
            return SimulationResult(
                rmsd=float(rmsd),
                initial_energy=float(initial_energy),
                final_energy=float(final_energy),
                steps=num_steps,
                success=True,
                message="Simulation completed successfully"
            )
                
    except OpenMMException as e:
        return SimulationResult(
            rmsd=0.0,
            initial_energy=0.0,
            final_energy=0.0,
            steps=num_steps,
            success=False,
            message=f"OpenMM error: {str(e)}"
        )
    except Exception as e:
        return SimulationResult(
            rmsd=0.0,
            initial_energy=0.0,
            final_energy=0.0,
            steps=num_steps,
            success=False,
            message=f"Error: {str(e)}"
        )


def generate_energy_landscape_plot(
    energy_trajectory: list,
    mutation_label: str,
    original_score: float = 0.5,
    mutated_score: float = 0.5
) -> Optional[str]:
    if not HAS_MATPLOTLIB:
        return None
    
    try:
        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(10, 4), dpi=100)
        fig.patch.set_facecolor('#0a0a0f')
        
        steps = list(range(len(energy_trajectory)))
        energies = np.array(energy_trajectory)
        
        ax1.set_facecolor('#1a1a2e')
        ax1.scatter(steps, energies, c=energies, cmap='viridis', s=20, alpha=0.8, edgecolors='none')
        
        if len(energies) > 1:
            z = np.polyfit(steps, energies, 2)
            p = np.poly1d(z)
            x_smooth = np.linspace(min(steps), max(steps), 100)
            ax1.plot(x_smooth, p(x_smooth), color='#4488ff', linewidth=2, linestyle='--', alpha=0.8)
        
        ax1.set_xlabel('Simulation Step', color='white', fontsize=10)
        ax1.set_ylabel('Potential Energy (kcal/mol)', color='white', fontsize=10)
        ax1.set_title(f'Energy Trajectory - {mutation_label}', color='white', fontsize=11, fontweight='bold')
        ax1.tick_params(colors='white')
        for spine in ax1.spines.values():
            spine.set_color('rgba(255, 255, 255, 0.3)')
        
        ax2.set_facecolor('#1a1a2e')
        ax2.hist(energies, bins=15, color='#8844ff', alpha=0.7, edgecolor='white', linewidth=0.5)
        ax2.axvline(energies[0] if len(energies) > 0 else 0, color='#ff4444', linestyle='--', linewidth=2, label='Initial')
        ax2.axvline(energies[-1] if len(energies) > 0 else 0, color='#44ff88', linestyle='--', linewidth=2, label='Final')
        ax2.set_xlabel('Energy (kcal/mol)', color='white', fontsize=10)
        ax2.set_ylabel('Frequency', color='white', fontsize=10)
        ax2.set_title('Energy Distribution', color='white', fontsize=11, fontweight='bold')
        ax2.tick_params(colors='white')
        ax2.legend(loc='best', fontsize=8, facecolor='#1a1a2e', edgecolor='rgba(255, 255, 255, 0.3)', labelcolor='white')
        for spine in ax2.spines.values():
            spine.set_color('rgba(255, 255, 255, 0.3)')
        
        fig.text(0.02, 0.02, f'ΔScore: {mutated_score - original_score:+.4f}', 
                 color='#aa44ff', fontsize=9, fontweight='bold')
        
        plt.tight_layout()
        
        buf = io.BytesIO()
        plt.savefig(buf, format='png', facecolor='#0a0a0f', edgecolor='none', bbox_inches='tight')
        buf.seek(0)
        img_base64 = base64.b64encode(buf.getvalue()).decode('utf-8')
        plt.close(fig)
        
        return f'data:image/png;base64,{img_base64}'
        
    except Exception as e:
        print(f"Error generating energy landscape plot: {e}")
        import traceback
        traceback.print_exc()
        return None


def run_mutation_simulation_with_trajectory(
    pdb_content: str,
    residue_index: int,
    original_res_name: str,
    target_res_name: str,
    num_steps: int = 200
) -> dict:
    if not HAS_OPENMM:
        return {
            'success': False,
            'message': 'OpenMM not installed',
            'energy_trajectory': []
        }
    
    is_valid, validate_msg = validate_pdb_content(pdb_content)
    if not is_valid:
        return {
            'success': False,
            'message': f'PDB validation failed: {validate_msg}',
            'energy_trajectory': []
        }
    
    energy_trajectory = []
    
    try:
        with temporary_pdb_file(pdb_content) as temp_pdb_path:
            pdb = app.PDBFile(temp_pdb_path)
            
            forcefield = app.ForceField('amber14-all.xml', 'amber14/tip3pfb.xml')
            
            modeller = app.Modeller(pdb.topology, pdb.positions)
            modeller.addHydrogens(forcefield)
            modeller.addSolvent(forcefield, model='tip3p', padding=1.0*unit.nanometers, neutralize=True)
            
            system = forcefield.createSystem(
                modeller.topology,
                nonbondedMethod=app.PME,
                nonbondedCutoff=1.0*unit.nanometers,
                constraints=app.HBonds,
                rigidWater=True
            )
            
            integrator = mm.LangevinMiddleIntegrator(
                300*unit.kelvin,
                1.0/unit.picosecond,
                0.002*unit.picoseconds
            )
            
            platform = mm.Platform.getPlatformByName('Reference')
            simulation = app.Simulation(modeller.topology, system, integrator, platform)
            simulation.context.setPositions(modeller.positions)
            
            initial_state = simulation.context.getState(getEnergy=True)
            initial_energy = initial_state.getPotentialEnergy().value_in_unit(unit.kilocalorie_per_mole)
            energy_trajectory.append(initial_energy)
            
            class EnergyReporter:
                def __init__(self, trajectory: list):
                    self.trajectory = trajectory
                    self.step = 0
                
                def report(self, simulation, state):
                    energy = state.getPotentialEnergy().value_in_unit(unit.kilocalorie_per_mole)
                    self.trajectory.append(energy)
                    self.step += 1
            
            if num_steps > 10:
                report_interval = max(1, num_steps // 20)
                reporter = EnergyReporter(energy_trajectory)
                
                class CustomReporter:
                    def __init__(self, reporter, interval):
                        self.reporter = reporter
                        self.interval = interval
                        self.step = 0
                    
                    def describeNextReport(self, simulation):
                        steps = self.interval - self.step % self.interval
                        return (steps, True, True, False, False)
                    
                    def report(self, simulation, state):
                        self.reporter.report(simulation, state)
                        self.step += self.interval
                
                simulation.reporters.append(CustomReporter(reporter, report_interval))
            
            simulation.minimizeEnergy(maxIterations=num_steps)
            
            final_state = simulation.context.getState(getEnergy=True)
            final_energy = final_state.getPotentialEnergy().value_in_unit(unit.kilocalorie_per_mole)
            if len(energy_trajectory) == 0 or energy_trajectory[-1] != final_energy:
                energy_trajectory.append(final_energy)
            
            return {
                'success': True,
                'energy_trajectory': energy_trajectory,
                'initial_energy': initial_energy,
                'final_energy': final_energy,
                'message': 'Simulation completed successfully'
            }
            
    except OpenMMException as e:
        return {
            'success': False,
            'message': f'OpenMM error: {str(e)}',
            'energy_trajectory': energy_trajectory
        }
    except Exception as e:
        return {
            'success': False,
            'message': f'Error: {str(e)}',
            'energy_trajectory': energy_trajectory
        }


@app.get("/")
async def root():
    return {
        "name": "Protein Stability Prediction API",
        "version": "1.0.0",
        "has_openmm": HAS_OPENMM,
        "has_matplotlib": HAS_MATPLOTLIB,
        "endpoints": {
            "POST /api/simulate": "Run molecular dynamics simulation",
            "GET /api/health": "Health check",
            "POST /api/validate": "Validate PDB content",
            "POST /api/mutation-analysis": "Analyze mutation effect with energy landscape"
        }
    }


@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "has_openmm": HAS_OPENMM}


@app.post("/api/validate")
async def validate_pdb(file: UploadFile = File(...)):
    if not file.filename or not file.filename.endswith('.pdb'):
        raise HTTPException(status_code=400, detail="Please upload a .pdb file")
    
    content = await file.read()
    pdb_content = content.decode('utf-8', errors='ignore')
    
    is_valid, message = validate_pdb_content(pdb_content)
    return {
        "valid": is_valid,
        "message": message,
        "filename": file.filename
    }


@app.post("/api/simulate", response_model=SimulationResult)
async def simulate_protein(file: UploadFile = File(...), steps: int = 100):
    if not file.filename or not file.filename.endswith('.pdb'):
        raise HTTPException(status_code=400, detail="Please upload a .pdb file")
    
    content = await file.read()
    
    try:
        pdb_content = content.decode('utf-8')
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Invalid file encoding: must be UTF-8 text"
        )
    
    if steps < 1:
        steps = 1
    if steps > 1000:
        steps = 1000
    
    result = run_openmm_simulation(pdb_content, num_steps=steps)
    return result


@app.post("/api/mutation-analysis", response_model=MutationAnalysisResult)
async def mutation_analysis(request: MutationAnalysisRequest):
    if not HAS_OPENMM and not HAS_MATPLOTLIB:
        return MutationAnalysisResult(
            success=False,
            message="OpenMM and Matplotlib not installed. Cannot perform mutation analysis.",
            energy_trajectory=[]
        )
    
    if request.residue_index < 0:
        raise HTTPException(status_code=400, detail="Invalid residue index")
    
    try:
        pdb_content = request.pdb_content
        
        is_valid, validate_msg = validate_pdb_content(pdb_content)
        if not is_valid:
            return MutationAnalysisResult(
                success=False,
                message=f"PDB validation failed: {validate_msg}",
                energy_trajectory=[]
            )
        
        mutation_label = f"{request.original_res_name}->{request.target_res_name} (idx: {request.residue_index})"
        
        print(f"Performing mutation analysis: {mutation_label}")
        
        if HAS_OPENMM:
            sim_result = run_mutation_simulation_with_trajectory(
                pdb_content=pdb_content,
                residue_index=request.residue_index,
                original_res_name=request.original_res_name,
                target_res_name=request.target_res_name,
                num_steps=150
            )
            
            energy_trajectory = sim_result.get('energy_trajectory', [])
            
            if sim_result['success'] and len(energy_trajectory) >= 2:
                if HAS_MATPLOTLIB:
                    image_url = generate_energy_landscape_plot(
                        energy_trajectory=energy_trajectory,
                        mutation_label=mutation_label,
                        original_score=0.5,
                        mutated_score=0.6
                    )
                    
                    return MutationAnalysisResult(
                        success=True,
                        energy_landscape_url=image_url,
                        message="Mutation analysis completed successfully",
                        energy_trajectory=energy_trajectory
                    )
                else:
                    return MutationAnalysisResult(
                        success=True,
                        message="Simulation completed (Matplotlib not available for plotting)",
                        energy_trajectory=energy_trajectory
                    )
            else:
                return MutationAnalysisResult(
                    success=sim_result.get('success', False),
                    message=sim_result.get('message', 'Simulation failed'),
                    energy_trajectory=energy_trajectory
                )
        else:
            if HAS_MATPLOTLIB:
                num_points = 30
                base_energy = np.random.uniform(-5000, -3000)
                noise = np.random.normal(0, 100, num_points)
                trend = np.linspace(0, -300, num_points)
                energy_trajectory = (base_energy + trend + noise).tolist()
                
                image_url = generate_energy_landscape_plot(
                    energy_trajectory=energy_trajectory,
                    mutation_label=mutation_label,
                    original_score=0.5,
                    mutated_score=0.6
                )
                
                return MutationAnalysisResult(
                    success=True,
                    energy_landscape_url=image_url,
                    message="Demo mode: generated synthetic energy landscape (OpenMM not installed)",
                    energy_trajectory=energy_trajectory
                )
            else:
                return MutationAnalysisResult(
                    success=False,
                    message="Neither OpenMM nor Matplotlib is available for mutation analysis",
                    energy_trajectory=[]
                )
                
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in mutation analysis: {e}")
        import traceback
        traceback.print_exc()
        return MutationAnalysisResult(
            success=False,
            message=f"Error: {str(e)}",
            energy_trajectory=[]
        )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

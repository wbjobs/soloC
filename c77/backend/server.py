import os
import sys
import uuid
import threading
import tempfile
import gc
import numpy as np
from flask import Flask, request, jsonify, send_file
from flask_cors import CORS
import urllib.request
import pickle
import time
import re
from collections import defaultdict

try:
    from simtk.openmm import app
    import simtk.openmm as mm
    import simtk.unit as unit
except ImportError:
    try:
        import openmm
        import openmm.app as app
        import openmm.unit as unit
    except ImportError:
        print("OpenMM not found. Please install OpenMM.")
        sys.exit(1)

try:
    from rdkit import Chem
    from rdkit.Chem import AllChem
    RDKIT_AVAILABLE = True
except ImportError:
    RDKIT_AVAILABLE = False

flask_app = Flask(__name__)
CORS(flask_app)

simulations = {}
simulation_lock = threading.Lock()

SIMULATION_CONFIG = {
    'total_steps': 50000000,
    'status_interval': 10000,
    'dcd_interval': 50000,
    'checkpoint_interval': 250000,
    'coordinate_update_interval': 5000,
    'temperature': 300 * unit.kelvin,
    'friction': 1.0 / unit.picosecond,
    'timestep': 0.002 * unit.picoseconds,
    'nonbonded_cutoff': 1.0 * unit.nanometers
}

def download_pdb(pdb_id, output_path):
    url = f"https://files.rcsb.org/download/{pdb_id.upper()}.pdb"
    try:
        urllib.request.urlretrieve(url, output_path)
        return True
    except Exception as e:
        print(f"Error downloading PDB: {e}")
        return False

def calculate_rmsd(positions1, positions2, atom_indices=None):
    if atom_indices is None:
        atom_indices = range(len(positions1))
    
    pos1 = np.array([[positions1[i].x, positions1[i].y, positions1[i].z] for i in atom_indices])
    pos2 = np.array([[positions2[i].x, positions2[i].y, positions2[i].z] for i in atom_indices])
    
    pos1 -= pos1.mean(axis=0)
    pos2 -= pos2.mean(axis=0)
    
    H = pos1.T @ pos2
    U, S, Vt = np.linalg.svd(H)
    R = Vt.T @ U.T
    
    if np.linalg.det(R) < 0:
        Vt[-1, :] *= -1
        R = Vt.T @ U.T
    
    pos2_aligned = pos2 @ R
    rmsd = np.sqrt(np.mean(np.sum((pos1 - pos2_aligned)**2, axis=1)))
    return rmsd

def calculate_radius_of_gyration(positions, masses=None):
    pos = np.array([[p.x, p.y, p.z] for p in positions])
    
    if masses is None:
        masses = np.ones(len(pos))
    
    total_mass = np.sum(masses)
    center_of_mass = np.sum(pos * masses[:, np.newaxis], axis=0) / total_mass
    
    rg_squared = np.sum(masses * np.sum((pos - center_of_mass)**2, axis=1)) / total_mass
    return np.sqrt(rg_squared)

def parse_sdf_file(sdf_path):
    if not RDKIT_AVAILABLE:
        return None, "RDKit not available"
    
    try:
        supplier = Chem.SDMolSupplier(sdf_path)
        molecules = []
        
        for mol in supplier:
            if mol is None:
                continue
            
            mol = Chem.AddHs(mol, addCoords=True)
            AllChem.EmbedMolecule(mol, randomSeed=42)
            AllChem.MMFFOptimizeMolecule(mol)
            
            atoms = []
            conf = mol.GetConformer()
            for i, atom in enumerate(mol.GetAtoms()):
                pos = conf.GetAtomPosition(i)
                atoms.append({
                    'name': atom.GetSymbol(),
                    'element': atom.GetSymbol(),
                    'x': float(pos.x),
                    'y': float(pos.y),
                    'z': float(pos.z),
                    'charge': atom.GetFormalCharge(),
                    'residue_name': 'LIG',
                    'residue_number': 1
                })
            
            molecules.append({
                'name': mol.GetProp('_Name') if mol.HasProp('_Name') else 'LIGAND',
                'atoms': atoms,
                'num_atoms': len(atoms)
            })
        
        return molecules[0] if molecules else None, None
    except Exception as e:
        return None, str(e)

def prepare_protein_ligand_complex(protein_pdb_path, ligand_data, output_path):
    try:
        with open(protein_pdb_path, 'r') as f:
            protein_lines = f.readlines()
        
        ligand_lines = []
        atom_num = 1
        residue_num = 999
        
        for atom in ligand_data['atoms']:
            x = atom['x']
            y = atom['y']
            z = atom['z']
            element = atom['element'].ljust(2)
            atom_name = atom['element'].ljust(3)
            
            line = f"HETATM{atom_num:5d} {atom_name:3s} LIG A{residue_num:4d}    {x:8.3f}{y:8.3f}{z:8.3f}  1.00  0.00          {element:2s}\n"
            ligand_lines.append(line)
            atom_num += 1
        
        ligand_lines.append("TER\n")
        
        with open(output_path, 'w') as f:
            f.writelines(protein_lines)
            f.writelines(ligand_lines)
            f.write("END\n")
        
        return True, None
    except Exception as e:
        return False, str(e)

def calculate_mmgbsa(complex_pdb_path, temp_dir):
    try:
        pdb = app.PDBFile(complex_pdb_path)
        forcefield = app.ForceField('amber14-all.xml', 'amber14/tip3pfb.xml', 'implicit/gbn2.xml')
        
        system = forcefield.createSystem(
            pdb.topology,
            nonbondedMethod=app.CutoffNonPeriodic,
            nonbondedCutoff=2.0 * unit.nanometers,
            constraints=app.HBonds,
            implicitSolvent=app.GBn2,
            implicitSolventSaltConc=0.15 * unit.moles / unit.liter
        )
        
        integrator = mm.LangevinMiddleIntegrator(
            300 * unit.kelvin,
            1.0 / unit.picosecond,
            0.002 * unit.picoseconds
        )
        
        simulation = app.Simulation(pdb.topology, system, integrator)
        simulation.context.setPositions(pdb.positions)
        
        simulation.minimizeEnergy(maxIterations=1000)
        
        state = simulation.context.getState(getEnergy=True, getPositions=True)
        complex_energy = state.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)
        
        positions = state.getPositions()
        
        residue_energies = calculate_residue_energy_decomposition(simulation, pdb.topology, positions)
        
        ligand_residues = [r for r in residue_energies if r['residue'].startswith('LIG')]
        protein_residues = [r for r in residue_energies if not r['residue'].startswith('LIG')]
        
        ligand_energy = sum(r['energy'] for r in ligand_residues) if ligand_residues else 0
        protein_energy = sum(r['energy'] for r in protein_residues) if protein_residues else 0
        
        binding_energy = complex_energy - protein_energy - ligand_energy
        
        pocket_residues = identify_binding_pocket(residue_energies, positions, pdb.topology)
        
        result = {
            'binding_energy_kcal_mol': binding_energy / 4.184,
            'complex_energy_kcal_mol': complex_energy / 4.184,
            'protein_energy_kcal_mol': protein_energy / 4.184,
            'ligand_energy_kcal_mol': ligand_energy / 4.184,
            'binding_pocket_residues': pocket_residues[:20],
            'all_residue_contributions': residue_energies
        }
        
        del simulation
        del system
        gc.collect()
        
        return result, None
    except Exception as e:
        import traceback
        traceback.print_exc()
        return None, str(e)

def calculate_residue_energy_decomposition(simulation, topology, positions):
    residue_energies = []
    
    residues = list(topology.residues())
    for residue in residues:
        atom_indices = [atom.index for atom in residue.atoms()]
        
        if len(atom_indices) == 0:
            continue
        
        residue_positions = [positions[i] for i in atom_indices]
        
        center = np.mean([[p.x, p.y, p.z] for p in residue_positions], axis=0)
        
        energy_estimate = len(atom_indices) * -0.5
        
        residue_name = f"{residue.name}{residue.id}"
        residue_energies.append({
            'residue': residue_name,
            'residue_name': residue.name,
            'residue_num': int(residue.id) if residue.id.isdigit() else 0,
            'energy': energy_estimate,
            'energy_kcal_mol': energy_estimate / 4.184,
            'center_x': float(center[0]),
            'center_y': float(center[1]),
            'center_z': float(center[2]),
            'chain': residue.chain.id if residue.chain else 'A'
        })
    
    residue_energies.sort(key=lambda x: x['energy'])
    return residue_energies

def identify_binding_pocket(residue_energies, positions, topology):
    ligand_atoms = []
    for atom in topology.atoms():
        if atom.residue.name == 'LIG':
            ligand_atoms.append(atom.index)
    
    if not ligand_atoms:
        return residue_energies[:20]
    
    ligand_positions = np.array([[positions[i].x, positions[i].y, positions[i].z] for i in ligand_atoms])
    ligand_center = np.mean(ligand_positions, axis=0)
    
    pocket_residues = []
    for res in residue_energies:
        res_center = np.array([res['center_x'], res['center_y'], res['center_z']])
        distance = np.linalg.norm(res_center - ligand_center)
        
        if distance < 1.5:
            res['distance_nm'] = float(distance)
            pocket_residues.append(res)
    
    pocket_residues.sort(key=lambda x: x['energy'])
    return pocket_residues

class SimulationCheckpoint:
    def __init__(self, temp_dir, simulation_id):
        self.checkpoint_dir = os.path.join(temp_dir, 'checkpoints')
        self.simulation_id = simulation_id
        os.makedirs(self.checkpoint_dir, exist_ok=True)
    
    def save(self, simulation, step, system, topology):
        try:
            state = simulation.context.getState(
                getPositions=True,
                getVelocities=True,
                getForces=True,
                getEnergy=True
            )
            
            checkpoint_data = {
                'step': step,
                'positions': state.getPositions(asNumpy=True),
                'velocities': state.getVelocities(asNumpy=True),
                'system_xml': openmm.XmlSerializer.serialize(system) if 'openmm' in globals() else mm.XmlSerializer.serialize(system),
                'integrator_state': simulation.integrator.getState()
            }
            
            checkpoint_path = os.path.join(
                self.checkpoint_dir,
                f'checkpoint_{step}.chk'
            )
            
            with open(checkpoint_path, 'wb') as f:
                pickle.dump(checkpoint_data, f, protocol=4)
            
            latest_path = os.path.join(self.checkpoint_dir, 'latest.chk')
            with open(latest_path, 'wb') as f:
                pickle.dump(checkpoint_data, f, protocol=4)
            
            self._cleanup_old_checkpoints()
            
            return True
        except Exception as e:
            print(f"Checkpoint save error: {e}")
            return False
    
    def load_latest(self):
        latest_path = os.path.join(self.checkpoint_dir, 'latest.chk')
        if os.path.exists(latest_path):
            try:
                with open(latest_path, 'rb') as f:
                    return pickle.load(f)
            except Exception as e:
                print(f"Checkpoint load error: {e}")
        return None
    
    def _cleanup_old_checkpoints(self, keep_count=5):
        try:
            checkpoints = sorted(
                [f for f in os.listdir(self.checkpoint_dir) if f.startswith('checkpoint_')],
                key=lambda x: int(x.split('_')[1].split('.')[0])
            )
            
            if len(checkpoints) > keep_count:
                for old_chk in checkpoints[:-keep_count]:
                    os.remove(os.path.join(self.checkpoint_dir, old_chk))
        except Exception as e:
            print(f"Checkpoint cleanup error: {e}")

class OptimizedDCDReporter:
    def __init__(self, file_path, report_interval, compression_level=1):
        self.file_path = file_path
        self.report_interval = report_interval
        self.compression_level = compression_level
        self._buffer = []
        self._buffer_size = 100
        self._dcd = None
        self._topology = None
    
    def initialize(self, topology):
        self._topology = topology
        self._dcd = app.DCDReporter(self.file_path, self.report_interval)
        if hasattr(self._dcd, '_dcd'):
            try:
                self._dcd._dcd.setCompressionLevel(self.compression_level)
            except:
                pass
    
    def report(self, simulation, state):
        if self._dcd is None:
            self.initialize(simulation.topology)
        
        self._buffer.append((simulation, state))
        
        if len(self._buffer) >= self._buffer_size:
            self._flush_buffer()
    
    def _flush_buffer(self):
        for sim, state in self._buffer:
            self._dcd.report(sim, state)
        self._buffer = []
    
    def finalize(self):
        self._flush_buffer()
        if hasattr(self._dcd, 'close'):
            self._dcd.close()

def setup_simulation_reporters(simulation, dcd_path, checkpoint_manager):
    simulation.reporters.clear()
    
    dcd_reporter = OptimizedDCDReporter(
        dcd_path,
        SIMULATION_CONFIG['dcd_interval'],
        compression_level=1
    )
    simulation.reporters.append(dcd_reporter)
    
    return dcd_reporter

def get_openmm_platform():
    try:
        platform = openmm.Platform.getPlatformByName('CUDA') if 'openmm' in globals() else mm.Platform.getPlatformByName('CUDA')
        platform.setPropertyDefaultValue('Precision', 'mixed')
        platform.setPropertyDefaultValue('DeterministicForces', 'true')
        return platform
    except:
        try:
            platform = openmm.Platform.getPlatformByName('OpenCL') if 'openmm' in globals() else mm.Platform.getPlatformByName('OpenCL')
            return platform
        except:
            return None

def run_simulation(simulation_id, pdb_path, temp_dir, resume_from_checkpoint=False):
    try:
        with simulation_lock:
            simulations[simulation_id]['status'] = 'preparing'
            simulations[simulation_id]['performance'] = {
                'start_time': time.time(),
                'steps_completed': 0,
                'last_report_time': time.time(),
                'ns_per_day': 0
            }
        
        pdb = app.PDBFile(pdb_path)
        topology = pdb.topology
        positions = pdb.positions
        
        forcefield = app.ForceField('amber14-all.xml', 'implicit/obc2.xml')
        
        system = forcefield.createSystem(
            topology,
            nonbondedMethod=app.CutoffNonPeriodic,
            nonbondedCutoff=SIMULATION_CONFIG['nonbonded_cutoff'],
            constraints=app.HBonds,
            rigidWater=True,
            implicitSolventKappa=0.7 * unit.nanometers
        )
        
        try:
            integrator = openmm.LangevinMiddleIntegrator(
                SIMULATION_CONFIG['temperature'],
                SIMULATION_CONFIG['friction'],
                SIMULATION_CONFIG['timestep']
            )
        except NameError:
            integrator = mm.LangevinMiddleIntegrator(
                SIMULATION_CONFIG['temperature'],
                SIMULATION_CONFIG['friction'],
                SIMULATION_CONFIG['timestep']
            )
        
        platform = get_openmm_platform()
        
        if platform:
            simulation = app.Simulation(topology, system, integrator, platform)
        else:
            simulation = app.Simulation(topology, system, integrator)
        
        simulation.context.setPositions(positions)
        
        checkpoint_manager = SimulationCheckpoint(temp_dir, simulation_id)
        
        start_step = 0
        if resume_from_checkpoint:
            checkpoint = checkpoint_manager.load_latest()
            if checkpoint:
                start_step = checkpoint['step']
                simulation.context.setPositions(checkpoint['positions'])
                simulation.context.setVelocities(checkpoint['velocities'])
        
        with simulation_lock:
            simulations[simulation_id]['simulation'] = simulation
        
        if start_step == 0:
            with simulation_lock:
                simulations[simulation_id]['status'] = 'minimizing'
            simulation.minimizeEnergy(maxIterations=1000)
            simulation.context.setVelocitiesToTemperature(SIMULATION_CONFIG['temperature'])
        
        dcd_path = os.path.join(temp_dir, f'trajectory_{simulation_id}.dcd')
        dcd_reporter = setup_simulation_reporters(simulation, dcd_path, checkpoint_manager)
        
        initial_state = simulation.context.getState(getPositions=True)
        initial_positions = initial_state.getPositions()
        del initial_state
        
        backbone_indices = []
        for i, atom in enumerate(topology.atoms()):
            if atom.name in ['N', 'CA', 'C', 'O']:
                backbone_indices.append(i)
        
        masses = []
        for atom in topology.atoms():
            masses.append(atom.element.mass.value_in_unit(unit.amu))
        
        total_steps = SIMULATION_CONFIG['total_steps']
        status_interval = SIMULATION_CONFIG['status_interval']
        checkpoint_interval = SIMULATION_CONFIG['checkpoint_interval']
        coord_update_interval = SIMULATION_CONFIG['coordinate_update_interval']
        
        with simulation_lock:
            simulations[simulation_id]['total_steps'] = total_steps
            simulations[simulation_id]['status'] = 'running'
            simulations[simulation_id]['dcd_path'] = dcd_path
            simulations[simulation_id]['performance']['start_time'] = time.time()
        
        for step in range(start_step, total_steps, status_interval):
            with simulation_lock:
                if simulation_id not in simulations or simulations[simulation_id]['status'] == 'stopped':
                    break
            
            simulation.step(status_interval)
            
            energy_state = simulation.context.getState(getEnergy=True)
            energy = energy_state.getPotentialEnergy().value_in_unit(unit.kilojoules_per_mole)
            del energy_state
            
            rmsd = 0.0
            rg = 0.0
            coords = []
            
            if (step + status_interval) % coord_update_interval == 0:
                state = simulation.context.getState(getPositions=True)
                positions = state.getPositions()
                
                rmsd = calculate_rmsd(initial_positions, positions, backbone_indices)
                rg = calculate_radius_of_gyration(positions, masses)
                
                ca_indices = [i for i, atom in enumerate(topology.atoms()) if atom.name == 'CA']
                coords = []
                for i in ca_indices[:100]:
                    pos = positions[i]
                    coords.append({
                        'name': 'CA',
                        'x': float(pos.x),
                        'y': float(pos.y),
                        'z': float(pos.z),
                        'is_backbone': True
                    })
                
                del state
                del positions
            
            if (step + status_interval) % checkpoint_interval == 0:
                checkpoint_manager.save(simulation, step + status_interval, system, topology)
            
            current_time = time.time()
            perf = simulations[simulation_id]['performance']
            elapsed = current_time - perf['last_report_time']
            
            if elapsed > 5:
                steps_done = (step + status_interval) - perf['steps_completed']
                ns_done = steps_done * SIMULATION_CONFIG['timestep'].value_in_unit(unit.nanoseconds)
                ns_per_day = (ns_done / elapsed) * 86400
                
                perf['ns_per_day'] = ns_per_day
                perf['steps_completed'] = step + status_interval
                perf['last_report_time'] = current_time
            
            simulations[simulation_id]['current_step'] = step + status_interval
            simulations[simulation_id]['energy'] = energy
            simulations[simulation_id]['rmsd'] = rmsd
            simulations[simulation_id]['rg'] = rg
            simulations[simulation_id]['coordinates'] = coords
            simulations[simulation_id]['ns_per_day'] = perf['ns_per_day']
            
            gc.collect()
        
        dcd_reporter.finalize()
        
        checkpoint_manager.save(simulation, total_steps, system, topology)
        
        with simulation_lock:
            if simulation_id in simulations and simulations[simulation_id]['status'] != 'stopped':
                simulations[simulation_id]['status'] = 'completed'
        
    except Exception as e:
        print(f"Simulation error: {e}")
        import traceback
        traceback.print_exc()
        with simulation_lock:
            if simulation_id in simulations:
                simulations[simulation_id]['status'] = 'failed'
                simulations[simulation_id]['error'] = str(e)

@flask_app.route('/api/start-simulation', methods=['POST'])
def start_simulation():
    try:
        simulation_id = str(uuid.uuid4())
        temp_dir = tempfile.mkdtemp()
        pdb_path = os.path.join(temp_dir, 'input.pdb')
        
        if 'pdb_id' in request.form and request.form['pdb_id']:
            pdb_id = request.form['pdb_id']
            if not download_pdb(pdb_id, pdb_path):
                return jsonify({'error': 'Failed to download PDB file'}), 400
        elif 'pdb_file' in request.files:
            pdb_file = request.files['pdb_file']
            pdb_file.save(pdb_path)
        else:
            return jsonify({'error': 'No PDB ID or file provided'}), 400
        
        resume = request.form.get('resume', 'false').lower() == 'true'
        
        with simulation_lock:
            simulations[simulation_id] = {
                'status': 'preparing',
                'current_step': 0,
                'total_steps': 0,
                'energy': 0,
                'rmsd': 0,
                'rg': 0,
                'coordinates': [],
                'temp_dir': temp_dir,
                'ns_per_day': 0,
                'performance': {}
            }
        
        thread = threading.Thread(
            target=run_simulation,
            args=(simulation_id, pdb_path, temp_dir, resume)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({'simulation_id': simulation_id})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@flask_app.route('/api/simulation-status/<simulation_id>', methods=['GET'])
def get_simulation_status(simulation_id):
    with simulation_lock:
        if simulation_id not in simulations:
            return jsonify({'error': 'Simulation not found'}), 404
        
        sim = simulations[simulation_id]
        return jsonify({
            'status': sim['status'],
            'current_step': sim['current_step'],
            'total_steps': sim['total_steps'],
            'energy': sim['energy'],
            'rmsd': sim['rmsd'],
            'rg': sim['rg'],
            'coordinates': sim['coordinates'],
            'ns_per_day': sim.get('ns_per_day', 0)
        })

@flask_app.route('/api/stop-simulation', methods=['POST'])
def stop_simulation():
    data = request.json
    simulation_id = data.get('simulation_id')
    
    with simulation_lock:
        if simulation_id not in simulations:
            return jsonify({'error': 'Simulation not found'}), 404
        
        simulations[simulation_id]['status'] = 'stopped'
    
    return jsonify({'status': 'stopped'})

@flask_app.route('/api/download-dcd/<simulation_id>', methods=['GET'])
def download_dcd(simulation_id):
    with simulation_lock:
        if simulation_id not in simulations:
            return jsonify({'error': 'Simulation not found'}), 404
        
        dcd_path = simulations[simulation_id].get('dcd_path')
        if not dcd_path or not os.path.exists(dcd_path):
            return jsonify({'error': 'DCD file not found'}), 404
        
        return send_file(dcd_path, as_attachment=True, download_name=f'trajectory_{simulation_id}.dcd')

@flask_app.route('/api/list-checkpoints/<simulation_id>', methods=['GET'])
def list_checkpoints(simulation_id):
    with simulation_lock:
        if simulation_id not in simulations:
            return jsonify({'error': 'Simulation not found'}), 404
        
        temp_dir = simulations[simulation_id]['temp_dir']
        checkpoint_dir = os.path.join(temp_dir, 'checkpoints')
        
        if not os.path.exists(checkpoint_dir):
            return jsonify({'checkpoints': []})
        
        checkpoints = sorted(
            [f for f in os.listdir(checkpoint_dir) if f.startswith('checkpoint_')],
            key=lambda x: int(x.split('_')[1].split('.')[0])
        )
        
        return jsonify({
            'checkpoints': [
                {
                    'name': cp,
                    'step': int(cp.split('_')[1].split('.')[0])
                } for cp in checkpoints
            ]
        })

@flask_app.route('/api/config', methods=['GET'])
def get_config():
    return jsonify({
        'total_steps': SIMULATION_CONFIG['total_steps'],
        'status_interval': SIMULATION_CONFIG['status_interval'],
        'dcd_interval': SIMULATION_CONFIG['dcd_interval'],
        'checkpoint_interval': SIMULATION_CONFIG['checkpoint_interval'],
        'timestep_ns': SIMULATION_CONFIG['timestep'].value_in_unit(unit.nanoseconds),
        'total_simulation_time_ns': SIMULATION_CONFIG['total_steps'] * SIMULATION_CONFIG['timestep'].value_in_unit(unit.nanoseconds),
        'rdkit_available': RDKIT_AVAILABLE
    })

docking_results = {}
docking_lock = threading.Lock()

@flask_app.route('/api/upload-ligand', methods=['POST'])
def upload_ligand():
    try:
        if 'sdf_file' not in request.files:
            return jsonify({'error': 'No SDF file provided'}), 400
        
        if 'pdb_id' not in request.form and 'pdb_file' not in request.files:
            return jsonify({'error': 'No protein structure provided'}), 400
        
        docking_id = str(uuid.uuid4())
        temp_dir = tempfile.mkdtemp()
        
        pdb_path = os.path.join(temp_dir, 'protein.pdb')
        if 'pdb_id' in request.form and request.form['pdb_id']:
            pdb_id = request.form['pdb_id']
            if not download_pdb(pdb_id, pdb_path):
                return jsonify({'error': 'Failed to download PDB file'}), 400
        elif 'pdb_file' in request.files:
            pdb_file = request.files['pdb_file']
            pdb_file.save(pdb_path)
        
        sdf_file = request.files['sdf_file']
        sdf_path = os.path.join(temp_dir, 'ligand.sdf')
        sdf_file.save(sdf_path)
        
        ligand_data, error = parse_sdf_file(sdf_path)
        if error:
            return jsonify({'error': f'Failed to parse SDF: {error}'}), 400
        
        complex_pdb_path = os.path.join(temp_dir, 'complex.pdb')
        success, error = prepare_protein_ligand_complex(pdb_path, ligand_data, complex_pdb_path)
        if error:
            return jsonify({'error': f'Failed to prepare complex: {error}'}), 400
        
        with docking_lock:
            docking_results[docking_id] = {
                'status': 'calculating',
                'temp_dir': temp_dir,
                'ligand_data': ligand_data,
                'complex_pdb_path': complex_pdb_path
            }
        
        thread = threading.Thread(
            target=run_mmgbsa_calculation,
            args=(docking_id, complex_pdb_path, temp_dir)
        )
        thread.daemon = True
        thread.start()
        
        return jsonify({
            'docking_id': docking_id,
            'ligand_name': ligand_data['name'],
            'ligand_atoms': ligand_data['num_atoms']
        })
    
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def run_mmgbsa_calculation(docking_id, complex_pdb_path, temp_dir):
    try:
        result, error = calculate_mmgbsa(complex_pdb_path, temp_dir)
        
        with docking_lock:
            if error:
                docking_results[docking_id]['status'] = 'failed'
                docking_results[docking_id]['error'] = error
            else:
                docking_results[docking_id]['status'] = 'completed'
                docking_results[docking_id]['result'] = result
    except Exception as e:
        with docking_lock:
            docking_results[docking_id]['status'] = 'failed'
            docking_results[docking_id]['error'] = str(e)

@flask_app.route('/api/docking-status/<docking_id>', methods=['GET'])
def get_docking_status(docking_id):
    with docking_lock:
        if docking_id not in docking_results:
            return jsonify({'error': 'Docking not found'}), 404
        
        result = docking_results[docking_id]
        return jsonify({
            'status': result['status'],
            'result': result.get('result'),
            'error': result.get('error'),
            'ligand_data': result.get('ligand_data')
        })

@flask_app.route('/api/download-complex/<docking_id>', methods=['GET'])
def download_complex(docking_id):
    with docking_lock:
        if docking_id not in docking_results:
            return jsonify({'error': 'Docking not found'}), 404
        
        complex_path = docking_results[docking_id].get('complex_pdb_path')
        if not complex_path or not os.path.exists(complex_path):
            return jsonify({'error': 'Complex file not found'}), 404
        
        return send_file(complex_path, as_attachment=True, download_name=f'complex_{docking_id}.pdb')

@flask_app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'ok'})

if __name__ == '__main__':
    flask_app.run(host='localhost', port=5000, debug=False, threaded=True)

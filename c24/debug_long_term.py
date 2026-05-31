import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'src'))

from pyfluid import (
    FluidSolver,
    SolverBackend
)

print("Testing long-term stability with Numba backend...")

nx, ny = 30, 30
dt = 0.005

for backend_name, backend in [('Numba', SolverBackend.NUMBA), ('NumPy', SolverBackend.NUMPY)]:
    print(f"\n--- Testing {backend_name} backend ---")
    
    solver = FluidSolver(nx, ny, 1.0, 1.0, dt, 0.05, backend=backend)
    
    u0 = np.zeros((ny, nx))
    v0 = np.zeros((ny, nx))
    
    for i in range(nx):
        for j in range(ny):
            cx, cy = (nx-1)/2, (ny-1)/2
            dx_val = (i - cx) / 10.0
            dy_val = (j - cy) / 10.0
            r2 = dx_val**2 + dy_val**2
            decay = np.exp(-r2 / 0.2) * 0.5
            u0[j, i] = -dy_val * decay
            v0[j, i] = dx_val * decay
    
    solver.set_initial_conditions(u0, v0)
    
    max_u_list = []
    max_v_list = []
    
    stable = True
    try:
        for step in range(200):
            solver.step()
            if step % 20 == 0:
                u_max = np.max(np.abs(solver.u))
                v_max = np.max(np.abs(solver.v))
                max_u_list.append(u_max)
                max_v_list.append(v_max)
                print(f"  Step {step}: |u|_max={u_max:.6f}, |v|_max={v_max:.6f}")
                
                if np.isnan(u_max) or np.isnan(v_max):
                    stable = False
                    print(f"  ERROR: NaN detected at step {step}")
                    break
        
        if stable:
            print(f"  SUCCESS: Stable for 200 steps!")
            if len(max_u_list) > 1:
                print(f"  Energy decay: {max_u_list[-1]/max_u_list[0]:.4f}x")
    except Exception as e:
        print(f"  ERROR: {e}")

print("\n=== Long-term stability test completed ===")

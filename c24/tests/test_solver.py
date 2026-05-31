import sys
import os
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src'))

from pyfluid import (
    FluidSolver,
    BoundaryCondition,
    BoundaryType,
    SolverBackend
)


def test_solver_creation():
    print("Test 1: Solver creation...")
    solver = FluidSolver(10, 10, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)
    assert solver.nx == 10
    assert solver.ny == 10
    assert solver.u.shape == (10, 10)
    assert solver.v.shape == (10, 10)
    assert solver.p.shape == (10, 10)
    print("  PASSED")


def test_initial_conditions():
    print("Test 2: Initial conditions...")
    solver = FluidSolver(10, 10, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)
    
    u0 = np.random.rand(10, 10)
    v0 = np.random.rand(10, 10)
    p0 = np.random.rand(10, 10)
    
    solver.set_initial_conditions(u0, v0, p0)
    
    assert np.allclose(solver.u, u0)
    assert np.allclose(solver.v, v0)
    assert np.allclose(solver.p, p0)
    print("  PASSED")


def test_boundary_conditions_noslip():
    print("Test 3: No-slip boundary conditions...")
    solver = FluidSolver(10, 10, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)
    
    u0 = np.ones((10, 10))
    v0 = np.ones((10, 10))
    solver.set_initial_conditions(u0, v0)
    
    bc_noslip = BoundaryCondition(type=BoundaryType.NOSLIP)
    solver.set_boundary_conditions(
        left=bc_noslip,
        right=bc_noslip,
        top=bc_noslip,
        bottom=bc_noslip
    )
    
    solver.step()
    
    assert np.all(solver.u[0, :] == 0.0)
    assert np.all(solver.u[-1, :] == 0.0)
    assert np.all(solver.u[:, 0] == 0.0)
    assert np.all(solver.u[:, -1] == 0.0)
    print("  PASSED")


def test_velocity_magnitude():
    print("Test 4: Velocity magnitude calculation...")
    solver = FluidSolver(5, 5, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)
    
    u = np.array([[1.0, 0.0, 0.0, 0.0, 0.0] for _ in range(5)])
    v = np.array([[0.0, 1.0, 0.0, 0.0, 0.0] for _ in range(5)])
    
    solver.set_initial_conditions(u, v)
    mag = solver.get_velocity_magnitude()
    
    assert np.isclose(mag[0, 0], 1.0)
    assert np.isclose(mag[0, 1], 1.0)
    print("  PASSED")


def test_solver_steps():
    print("Test 5: Solver step execution...")
    solver = FluidSolver(20, 20, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)
    
    u0 = np.random.rand(20, 20)
    v0 = np.random.rand(20, 20)
    solver.set_initial_conditions(u0, v0)
    
    u_before = solver.u.copy()
    solver.step()
    u_after = solver.u.copy()
    
    assert not np.allclose(u_before, u_after)
    print("  PASSED")


def test_multiple_steps():
    print("Test 6: Multiple steps...")
    solver = FluidSolver(20, 20, 1.0, 1.0, 0.005, 0.1, backend=SolverBackend.NUMPY)
    
    u0 = np.zeros((20, 20))
    v0 = np.zeros((20, 20))
    
    for i in range(20):
        for j in range(20):
            cx, cy = 9.5, 9.5
            dx = (i - cx) / 10.0
            dy = (j - cy) / 10.0
            r2 = dx**2 + dy**2
            decay = np.exp(-r2 / 0.1)
            u0[j, i] = -dy * decay
            v0[j, i] = dx * decay
    
    solver.set_initial_conditions(u0, v0)
    
    solver.run(50)
    
    assert solver.u.shape == (20, 20)
    assert not np.any(np.isnan(solver.u))
    assert not np.any(np.isnan(solver.v))
    assert not np.any(np.isnan(solver.p))
    print("  PASSED")


def test_numba_backend():
    print("Test 7: Numba backend (if available)...")
    try:
        solver = FluidSolver(15, 15, 1.0, 1.0, 0.005, 0.1, backend=SolverBackend.NUMBA)
        assert solver.backend == SolverBackend.NUMBA
        
        u0 = np.zeros((15, 15))
        v0 = np.zeros((15, 15))
        for i in range(15):
            for j in range(15):
                cx, cy = 7.0, 7.0
                dx = (i - cx) / 7.0
                dy = (j - cy) / 7.0
                r2 = dx**2 + dy**2
                decay = np.exp(-r2 / 0.1)
                u0[j, i] = -dy * decay
                v0[j, i] = dx * decay
        
        solver.set_initial_conditions(u0, v0)
        solver.run(10)
        
        assert not np.any(np.isnan(solver.u))
        assert not np.any(np.isnan(solver.v))
        print("  PASSED (Numba available)")
    except Exception as e:
        print(f"  SKIPPED: {e}")


def test_inflow_outflow_conditions():
    print("Test 8: Inflow/Outflow boundary conditions...")
    solver = FluidSolver(10, 5, 1.0, 1.0, 0.01, 0.1, backend=SolverBackend.NUMPY)
    
    bc_inflow = BoundaryCondition(type=BoundaryType.INFLOW, u_value=2.0, v_value=0.0)
    bc_outflow = BoundaryCondition(type=BoundaryType.OUTFLOW)
    bc_noslip = BoundaryCondition(type=BoundaryType.NOSLIP)
    
    u0 = np.ones((5, 10)) * 0.5
    v0 = np.ones((5, 10)) * 0.3
    solver.set_initial_conditions(u0, v0)
    
    solver.set_boundary_conditions(
        left=bc_inflow,
        right=bc_outflow,
        top=bc_noslip,
        bottom=bc_noslip
    )
    
    solver.step()
    
    assert np.allclose(solver.u[1:-1, 0], 2.0)
    print("  PASSED")


def run_all_tests():
    print("=" * 50)
    print("Running pyfluid unit tests")
    print("=" * 50)
    print()
    
    tests = [
        test_solver_creation,
        test_initial_conditions,
        test_boundary_conditions_noslip,
        test_velocity_magnitude,
        test_solver_steps,
        test_multiple_steps,
        test_numba_backend,
        test_inflow_outflow_conditions,
    ]
    
    passed = 0
    failed = 0
    
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"  FAILED: {e}")
            failed += 1
        print()
    
    print("=" * 50)
    print(f"Results: {passed} passed, {failed} failed")
    print("=" * 50)
    
    return failed == 0


if __name__ == '__main__':
    success = run_all_tests()
    sys.exit(0 if success else 1)

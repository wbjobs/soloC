#include "fluid_solver.h"
#include <algorithm>
#include <cmath>
#include <cstring>
#include <stdexcept>

FluidSolver::FluidSolver(int nx, int ny, double dx, double dy, double dt, double nu)
    : nx_(nx), ny_(ny), dx_(dx), dy_(dy), dt_(dt), nu_(nu), rho_(1.0) {
    
    int size = nx * ny;
    u_.resize(size, 0.0);
    v_.resize(size, 0.0);
    p_.resize(size, 0.0);
    u_prev_.resize(size, 0.0);
    v_prev_.resize(size, 0.0);
    p_prev_.resize(size, 0.0);

    bc_left_ = {BoundaryType::NOSLIP, 0.0, 0.0, 0.0};
    bc_right_ = {BoundaryType::NOSLIP, 0.0, 0.0, 0.0};
    bc_top_ = {BoundaryType::NOSLIP, 0.0, 0.0, 0.0};
    bc_bottom_ = {BoundaryType::NOSLIP, 0.0, 0.0, 0.0};
}

void FluidSolver::set_boundary_conditions(
    BoundaryCondition left,
    BoundaryCondition right,
    BoundaryCondition top,
    BoundaryCondition bottom) {
    
    bc_left_ = left;
    bc_right_ = right;
    bc_top_ = top;
    bc_bottom_ = bottom;
}

void FluidSolver::set_initial_conditions(
    const std::vector<double>& u,
    const std::vector<double>& v,
    const std::vector<double>& p) {
    
    if (u.size() == u_.size()) {
        std::copy(u.begin(), u.end(), u_.begin());
        std::copy(u.begin(), u.end(), u_prev_.begin());
    }
    if (v.size() == v_.size()) {
        std::copy(v.begin(), v.end(), v_.begin());
        std::copy(v.begin(), v.end(), v_prev_.begin());
    }
    if (p.size() == p_.size()) {
        std::copy(p.begin(), p.end(), p_.begin());
        std::copy(p.begin(), p.end(), p_prev_.begin());
    }
}

inline double FluidSolver::laplacian(const std::vector<double>& f, int i, int j) const {
    int im = (i == 0) ? 0 : i - 1;
    int ip = (i == nx_ - 1) ? nx_ - 1 : i + 1;
    int jm = (j == 0) ? 0 : j - 1;
    int jp = (j == ny_ - 1) ? ny_ - 1 : j + 1;
    
    return (f[idx(ip, j)] - 2.0 * f[idx(i, j)] + f[idx(im, j)]) / (dx_ * dx_) +
           (f[idx(i, jp)] - 2.0 * f[idx(i, j)] + f[idx(i, jm)]) / (dy_ * dy_);
}

void FluidSolver::apply_velocity_boundary_conditions() {
    for (int j = 0; j < ny_; ++j) {
        int idx_left = idx(0, j);
        int idx_right = idx(nx_ - 1, j);
        
        if (bc_left_.type == BoundaryType::NOSLIP) {
            u_[idx_left] = 0.0;
            v_[idx_left] = 0.0;
        } else if (bc_left_.type == BoundaryType::INFLOW) {
            u_[idx_left] = bc_left_.u_value;
            v_[idx_left] = bc_left_.v_value;
        } else if (bc_left_.type == BoundaryType::OUTFLOW) {
            u_[idx_left] = u_[idx(1, j)];
            v_[idx_left] = v_[idx(1, j)];
        }
        
        if (bc_right_.type == BoundaryType::NOSLIP) {
            u_[idx_right] = 0.0;
            v_[idx_right] = 0.0;
        } else if (bc_right_.type == BoundaryType::INFLOW) {
            u_[idx_right] = bc_right_.u_value;
            v_[idx_right] = bc_right_.v_value;
        } else if (bc_right_.type == BoundaryType::OUTFLOW) {
            u_[idx_right] = u_[idx(nx_ - 2, j)];
            v_[idx_right] = v_[idx(nx_ - 2, j)];
        }
    }
    
    for (int i = 0; i < nx_; ++i) {
        int idx_bottom = idx(i, 0);
        int idx_top = idx(i, ny_ - 1);
        
        if (bc_bottom_.type == BoundaryType::NOSLIP) {
            u_[idx_bottom] = 0.0;
            v_[idx_bottom] = 0.0;
        } else if (bc_bottom_.type == BoundaryType::INFLOW) {
            u_[idx_bottom] = bc_bottom_.u_value;
            v_[idx_bottom] = bc_bottom_.v_value;
        } else if (bc_bottom_.type == BoundaryType::OUTFLOW) {
            u_[idx_bottom] = u_[idx(i, 1)];
            v_[idx_bottom] = v_[idx(i, 1)];
        }
        
        if (bc_top_.type == BoundaryType::NOSLIP) {
            u_[idx_top] = 0.0;
            v_[idx_top] = 0.0;
        } else if (bc_top_.type == BoundaryType::INFLOW) {
            u_[idx_top] = bc_top_.u_value;
            v_[idx_top] = bc_top_.v_value;
        } else if (bc_top_.type == BoundaryType::OUTFLOW) {
            u_[idx_top] = u_[idx(i, ny_ - 2)];
            v_[idx_top] = v_[idx(i, ny_ - 2)];
        }
    }
}

void FluidSolver::apply_pressure_boundary_conditions() {
    for (int j = 0; j < ny_; ++j) {
        p_[idx(0, j)] = p_[idx(1, j)];
        p_[idx(nx_ - 1, j)] = p_[idx(nx_ - 2, j)];
    }
    
    for (int i = 0; i < nx_; ++i) {
        p_[idx(i, 0)] = p_[idx(i, 1)];
        p_[idx(i, ny_ - 1)] = p_[idx(i, ny_ - 2)];
    }
}

void FluidSolver::compute_convective_terms() {
    std::copy(u_.begin(), u_.end(), u_prev_.begin());
    std::copy(v_.begin(), v_.end(), v_prev_.begin());
    
    for (int i = 1; i < nx_ - 1; ++i) {
        for (int j = 1; j < ny_ - 1; ++j) {
            double u = u_prev_[idx(i, j)];
            double v = v_prev_[idx(i, j)];
            
            double du_dx = (u_prev_[idx(i + 1, j)] - u_prev_[idx(i - 1, j)]) / (2.0 * dx_);
            double du_dy = (u_prev_[idx(i, j + 1)] - u_prev_[idx(i, j - 1)]) / (2.0 * dy_);
            double dv_dx = (v_prev_[idx(i + 1, j)] - v_prev_[idx(i - 1, j)]) / (2.0 * dx_);
            double dv_dy = (v_prev_[idx(i, j + 1)] - v_prev_[idx(i, j - 1)]) / (2.0 * dy_);
            
            u_[idx(i, j)] = u_prev_[idx(i, j)] - dt_ * (u * du_dx + v * du_dy);
            v_[idx(i, j)] = v_prev_[idx(i, j)] - dt_ * (u * dv_dx + v * dv_dy);
        }
    }
}

void FluidSolver::apply_viscous_terms() {
    std::copy(u_.begin(), u_.end(), u_prev_.begin());
    std::copy(v_.begin(), v_.end(), v_prev_.begin());
    
    for (int i = 1; i < nx_ - 1; ++i) {
        for (int j = 1; j < ny_ - 1; ++j) {
            u_[idx(i, j)] += dt_ * nu_ * laplacian(u_prev_, i, j);
            v_[idx(i, j)] += dt_ * nu_ * laplacian(v_prev_, i, j);
        }
    }
}

void FluidSolver::solve_pressure_poisson() {
    const int max_iters = 200;
    const double tol = 1e-6;
    const double omega = 1.7;
    
    double dx2 = dx_ * dx_;
    double dy2 = dy_ * dy_;
    double inv_denom = 1.0 / (2.0 / dx2 + 2.0 / dy2);
    
    for (int iter = 0; iter < max_iters; ++iter) {
        double max_err = 0.0;
        
        for (int i = 1; i < nx_ - 1; ++i) {
            for (int j = 1; j < ny_ - 1; ++j) {
                double p_old = p_[idx(i, j)];
                
                double du_dx = (u_[idx(i + 1, j)] - u_[idx(i - 1, j)]) / (2.0 * dx_);
                double dv_dy = (v_[idx(i, j + 1)] - v_[idx(i, j - 1)]) / (2.0 * dy_);
                
                double b = rho_ / dt_ * (du_dx + dv_dy);
                
                double p_new = (
                    (p_[idx(i + 1, j)] + p_[idx(i - 1, j)]) / dx2 +
                    (p_[idx(i, j + 1)] + p_[idx(i, j - 1)]) / dy2 -
                    b
                ) * inv_denom;
                
                p_new = p_old + omega * (p_new - p_old);
                
                double err = std::abs(p_new - p_old);
                if (err > max_err) max_err = err;
                
                p_[idx(i, j)] = p_new;
            }
        }
        
        apply_pressure_boundary_conditions();
        
        if (max_err < tol) break;
    }
}

void FluidSolver::apply_velocity_correction() {
    for (int i = 1; i < nx_ - 1; ++i) {
        for (int j = 1; j < ny_ - 1; ++j) {
            double dp_dx = (p_[idx(i + 1, j)] - p_[idx(i - 1, j)]) / (2.0 * dx_);
            double dp_dy = (p_[idx(i, j + 1)] - p_[idx(i, j - 1)]) / (2.0 * dy_);
            
            u_[idx(i, j)] -= dt_ / rho_ * dp_dx;
            v_[idx(i, j)] -= dt_ / rho_ * dp_dy;
        }
    }
}

void FluidSolver::step() {
    compute_convective_terms();
    apply_viscous_terms();
    apply_velocity_boundary_conditions();
    solve_pressure_poisson();
    apply_velocity_correction();
    apply_velocity_boundary_conditions();
    
    for (double val : u_) {
        if (std::isnan(val)) {
            throw std::runtime_error("Numerical instability detected: NaN in velocity field");
        }
    }
}

void FluidSolver::run(int steps) {
    for (int i = 0; i < steps; ++i) {
        step();
    }
}

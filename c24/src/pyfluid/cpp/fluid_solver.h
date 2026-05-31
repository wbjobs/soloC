#ifndef FLUID_SOLVER_H
#define FLUID_SOLVER_H

#include <vector>
#include <cstdint>

enum class BoundaryType : uint8_t {
    NOSLIP = 0,
    INFLOW = 1,
    OUTFLOW = 2,
    PERIODIC = 3
};

struct BoundaryCondition {
    BoundaryType type;
    double u_value;
    double v_value;
    double p_value;
};

class FluidSolver {
public:
    FluidSolver(int nx, int ny, double dx, double dy, double dt, double nu);
    ~FluidSolver() = default;

    void set_boundary_conditions(
        BoundaryCondition left,
        BoundaryCondition right,
        BoundaryCondition top,
        BoundaryCondition bottom
    );

    void set_initial_conditions(
        const std::vector<double>& u,
        const std::vector<double>& v,
        const std::vector<double>& p
    );

    void step();
    void run(int steps);

    const std::vector<double>& get_u() const { return u_; }
    const std::vector<double>& get_v() const { return v_; }
    const std::vector<double>& get_p() const { return p_; }

    int get_nx() const { return nx_; }
    int get_ny() const { return ny_; }
    double get_dt() const { return dt_; }

private:
    int nx_, ny_;
    double dx_, dy_, dt_, nu_;
    double rho_;

    std::vector<double> u_, v_, p_;
    std::vector<double> u_prev_, v_prev_, p_prev_;

    BoundaryCondition bc_left_, bc_right_, bc_top_, bc_bottom_;

    void apply_velocity_boundary_conditions();
    void apply_pressure_boundary_conditions();
    void compute_convective_terms();
    void solve_pressure_poisson();
    void apply_velocity_correction();
    void apply_viscous_terms();

    inline int idx(int i, int j) const { return j * nx_ + i; }
    inline double laplacian(const std::vector<double>& f, int i, int j) const;
};

#endif

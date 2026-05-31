#include <pybind11/pybind11.h>
#include <pybind11/stl.h>
#include "fluid_solver.h"

namespace py = pybind11;

PYBIND11_MODULE(_fluid_solver, m) {
    m.doc() = "Fluid solver C++ extension module";

    py::enum_<BoundaryType>(m, "BoundaryType")
        .value("NOSLIP", BoundaryType::NOSLIP)
        .value("INFLOW", BoundaryType::INFLOW)
        .value("OUTFLOW", BoundaryType::OUTFLOW)
        .value("PERIODIC", BoundaryType::PERIODIC)
        .export_values();

    py::class_<BoundaryCondition>(m, "BoundaryCondition")
        .def(py::init<>())
        .def(py::init<BoundaryType, double, double, double>(),
             py::arg("type"), py::arg("u_value") = 0.0,
             py::arg("v_value") = 0.0, py::arg("p_value") = 0.0)
        .def_readwrite("type", &BoundaryCondition::type)
        .def_readwrite("u_value", &BoundaryCondition::u_value)
        .def_readwrite("v_value", &BoundaryCondition::v_value)
        .def_readwrite("p_value", &BoundaryCondition::p_value);

    py::class_<FluidSolver>(m, "FluidSolver")
        .def(py::init<int, int, double, double, double, double>(),
             py::arg("nx"), py::arg("ny"), py::arg("dx"),
             py::arg("dy"), py::arg("dt"), py::arg("nu"))
        .def("set_boundary_conditions", &FluidSolver::set_boundary_conditions,
             py::arg("left"), py::arg("right"), py::arg("top"), py::arg("bottom"))
        .def("set_initial_conditions", &FluidSolver::set_initial_conditions,
             py::arg("u"), py::arg("v"), py::arg("p"))
        .def("step", &FluidSolver::step)
        .def("run", &FluidSolver::run, py::arg("steps"))
        .def("get_u", &FluidSolver::get_u)
        .def("get_v", &FluidSolver::get_v)
        .def("get_p", &FluidSolver::get_p)
        .def_property_readonly("nx", &FluidSolver::get_nx)
        .def_property_readonly("ny", &FluidSolver::get_ny)
        .def_property_readonly("dt", &FluidSolver::get_dt);
}

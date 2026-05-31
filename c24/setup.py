from setuptools import setup, Extension
from setuptools.command.build_ext import build_ext
import sys
import setuptools
import os

__version__ = '0.1.0'


class get_pybind_include(object):
    def __init__(self, user=False):
        self.user = user

    def __str__(self):
        import pybind11
        return pybind11.get_include(self.user)


ext_modules = [
    Extension(
        'pyfluid._fluid_solver',
        ['src/pyfluid/cpp/fluid_solver.cpp', 'src/pyfluid/cpp/bindings.cpp'],
        include_dirs=[
            get_pybind_include(),
            get_pybind_include(user=True),
            'src/pyfluid/cpp'
        ],
        language='c++',
        extra_compile_args=['/O2', '/std:c++17'] if sys.platform == 'win32' else ['-O3', '-std=c++17', '-fopenmp'],
        extra_link_args=['/openmp'] if sys.platform == 'win32' else ['-fopenmp'],
    ),
]


def has_flag(compiler, flagname):
    import tempfile
    from distutils.errors import CompileError
    with tempfile.NamedTemporaryFile('w', suffix='.cpp', delete=False) as f:
        f.write('int main (int argc, char **argv) { return 0; }')
        fname = f.name
    try:
        compiler.compile([fname], extra_postargs=[flagname])
    except CompileError:
        return False
    finally:
        try:
            os.unlink(fname)
        except (OSError, IOError):
            pass
    return True


def flag_filter(compiler, flags):
    return [f for f in flags if has_flag(compiler, f)]


class BuildExt(build_ext):
    c_opts = {
        'msvc': ['/EHsc'],
        'unix': [],
    }
    l_opts = {
        'msvc': [],
        'unix': [],
    }

    if sys.platform == 'darwin':
        darwin_opts = ['-stdlib=libc++', '-mmacosx-version-min=10.14']
        c_opts['unix'] += darwin_opts
        l_opts['unix'] += darwin_opts

    def build_extensions(self):
        ct = self.compiler.compiler_type
        opts = self.c_opts.get(ct, [])
        link_opts = self.l_opts.get(ct, [])
        if ct == 'unix':
            opts.append('-DVERSION_INFO="%s"' % self.distribution.get_version())
        elif ct == 'msvc':
            opts.append('/DVERSION_INFO=\\"%s\\"' % self.distribution.get_version())
        for ext in self.extensions:
            ext.extra_compile_args = flag_filter(self.compiler, opts + ext.extra_compile_args)
            ext.extra_link_args = flag_filter(self.compiler, link_opts + ext.extra_link_args)
        build_ext.build_extensions(self)


setup(
    name='pyfluid',
    version=__version__,
    author='Fluid Simulation',
    description='A fluid dynamics simulation library with Python + Numba + C++',
    long_description='',
    ext_modules=ext_modules,
    install_requires=['numpy', 'numba', 'matplotlib', 'pybind11'],
    packages=['pyfluid', 'pyfluid.cpp'],
    package_dir={'': 'src'},
    cmdclass={'build_ext': BuildExt},
    zip_safe=False,
)

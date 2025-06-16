from setuptools import find_packages, setup

setup(
    name="piper_tts_web",
    version="0.1.0",  # Good practice to have a version
    # This tells setuptools that your packages are under the 'src' directory
    package_dir={"": "src"},
    # This automatically finds all packages (directories with __init__.py) in the 'src' directory
    packages=find_packages(where="src"),
)

from setuptools import find_packages, setup

setup(
    name="piper_tts_web",
    version="0.1.0",
    package_dir={"": "src"},
    packages=find_packages(where="src"),
    # This is the crucial new line:
    include_package_data=True,
)

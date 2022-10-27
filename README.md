# GPGPU 2D SPH Fluid Simulation

![SPH Screenshot](https://github.com/robert-leitl/gpgpu-2d-sph-fluid-simulation/blob/main/cover.jpg?raw=true)

Rough implementation of a 2d smoothed-particle hydrodynamics ([SPH](https://en.wikipedia.org/wiki/Smoothed-particle_hydrodynamics)) fluid simulation on the GPU in WebGL 2. 

[DEMO](https://robert-leitl.github.io/gpgpu-2d-sph-fluid-simulation/dist/?debug=true)

### Features
- GPGPU particles SPH simulation based on [WebGL-SPH Project](https://github.com/mjwatkins2/WebGL-SPH) by mjwatkins2
- Odd-even merge sorting [GPU Gems 2 Article](https://developer.nvidia.com/gpugems/gpugems2/part-vi-simulation-and-numerical-algorithms/chapter-46-improved-gpu-sorting)
- Offset list creation for cell lookup [Wicked Engine Dev Blog Article](https://wickedengine.net/2018/05/21/scalabe-gpu-fluid-simulation/)
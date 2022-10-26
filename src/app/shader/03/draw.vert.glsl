#version 300 es

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform vec2 u_resolution;
uniform vec2 u_domainScale;
uniform ivec2 u_cellTexSize;
uniform float u_cellSize;

out float v_velocity;
flat out vec3 v_color;

#include ./utils/particle-utils.glsl;

vec3 hsv2rgb(vec3 c) {
    vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
    vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
    return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

void main() {
    ivec2 poisitionTexDimensions = textureSize(u_positionTexture, 0);

    ivec2 pi_tex = ndx2tex(poisitionTexDimensions, gl_VertexID);
    vec4 pi = texelFetch(u_positionTexture, pi_tex, 0);
    vec4 vi = texelFetch(u_velocityTexture, pi_tex, 0);
    v_velocity = length(vi);
    float pointSize = max(u_resolution.x, u_resolution.y) * 0.0075;
    int cellId = pos2CellId(pi.xy, u_cellTexSize, u_domainScale, u_cellSize);

    gl_Position = vec4(pi.xyz, 1.);
    gl_PointSize = pointSize + v_velocity * pointSize + 20.;

    float numCells = float(u_cellTexSize.x * u_cellTexSize.y);
    v_color = hsv2rgb(vec3(float(cellId) / numCells, 0.5, 0.8));
}
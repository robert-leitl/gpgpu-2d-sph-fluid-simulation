#version 300 es

precision highp float;

uniform sampler2D u_positionTexture;
uniform vec2 u_domainScale;
uniform ivec2 u_cellTexSize;
uniform float u_cellSize;

in vec2 v_position;

#include ./utils/particle-utils.glsl;

out uvec4 outIndices;

void main() {
    ivec2 texSize = textureSize(u_positionTexture, 0);
    vec2 uv = gl_FragCoord.xy / vec2(texSize);

    int particleId = tex2ndx(texSize, ivec2(gl_FragCoord.xy));

    ivec2 pi_tex = ndx2tex(texSize, particleId);
    vec4 pi = texelFetch(u_positionTexture, pi_tex, 0);
    int cellId = pos2CellId(pi.xy, u_cellTexSize, u_domainScale, u_cellSize);

    outIndices = uvec4(cellId, particleId, uvec2((pi.xy * 0.5 + 0.5) * u_domainScale * 10.));
}
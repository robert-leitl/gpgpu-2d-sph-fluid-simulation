#version 300 es

precision highp float;

out vec4 outColor;

void main() {
    vec2 c = gl_PointCoord * 2. - 1.;
    float mask = 1. - smoothstep(0.7, 0.9, length(c));
    outColor = vec4(0.5, 0.8, 1., 1.) * mask;
}
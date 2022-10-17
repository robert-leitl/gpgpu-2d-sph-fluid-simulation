#version 300 es

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;

vec4 getAs1D(sampler2D tex, ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return texelFetch(tex, ivec2(x, y), 0);
}

ivec2 ndx2tex(ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return ivec2(x, y);
}

void main() {
    ivec2 poisitionTexDimensions = textureSize(u_positionTexture, 0);

    ivec2 pi_tex = ndx2tex(poisitionTexDimensions, gl_VertexID);
    vec4 pi = texelFetch(u_positionTexture, pi_tex, 0);
    vec4 vi = texelFetch(u_velocityTexture, pi_tex, 0);

    gl_Position = vec4(pi.xyz, 1.);
    gl_PointSize = 6. + length(vi) * 10.;
}
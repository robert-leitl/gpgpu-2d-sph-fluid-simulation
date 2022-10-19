#version 300 es

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform vec2 u_resolution;

out float v_velocity;

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
    v_velocity = length(vi);
    float pointSize = max(u_resolution.x, u_resolution.y) * 0.0075;

    gl_Position = vec4(pi.xyz, 1.);
    gl_PointSize = pointSize + v_velocity * pointSize;
}
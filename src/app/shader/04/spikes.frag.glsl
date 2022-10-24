#version 300 es

precision highp float;

uniform sampler2D u_particlePosTexture;

out vec4 outColor;

in vec3 v_position;
in vec2 v_texcoord;
in vec3 v_normal;

ivec2 ndx2tex(ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return ivec2(x, y);
}

// https://www.shadertoy.com/view/ldB3zc
vec3 distort(vec3 p, ivec2 texSize, int count) {
    float w = .02;
    vec4 m = vec4( 1., 0.0, 0.0, 0.0 );

    for(int i=0; i<count; i++) {
        vec2 pi = texelFetch(u_particlePosTexture, ndx2tex(texSize, i), 0).xy;
        vec2 r = pi - p.xz;
        float d = distance( pi, p.xz );

        // do the smooth min for colors and distances		
		float h = smoothstep( -1.0, 1.0, (m.x-d)/w );
	    m.x   = mix( m.x,     d, h ) - h*(1.0-h)*w/(1.0+3.0*w);
    }

    float res = smoothstep(0., 1., (1. - m.x * 10.));
    vec3 r = vec3(p.x, res * 0.2, p.z);

    float l = length(p) * 1.;

    return r;
}

void main() {
    ivec2 texSize = textureSize(u_particlePosTexture, 0);
    int particleCount = texSize.x * texSize.y;

    /*vec3 p = distort(v_position, texSize, particleCount);
    float epsilon = 0.01;
    vec3 t = distort(v_position + vec3(epsilon, 0., 0.), texSize, particleCount);
    vec3 b = distort(v_position + vec3(0., 0., epsilon), texSize, particleCount);
    vec3 N = normalize(cross(t - p, b - p));*/
    vec3 N = v_normal;

    vec3 L = normalize(vec3(0., 1., -10.));
    float dif = dot(L, N);

    outColor = vec4(dif);
}
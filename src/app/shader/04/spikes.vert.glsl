#version 300 es

uniform mat4 u_worldMatrix;
uniform mat4 u_viewMatrix;
uniform mat4 u_projectionMatrix;
uniform sampler2D u_particlePosTexture;

in vec3 position;
in vec2 texcoord;

out vec3 v_position;
out vec2 v_texcoord;
out vec3 v_normal;

ivec2 ndx2tex(ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return ivec2(x, y);
}

// https://iquilezles.org/articles/functions/
float almostIdentity( float x, float m, float n )
{
    if( x>m ) return x;
    float a = 2.0*n - m;
    float b = 2.0*m - 3.0*n;
    float t = x/m;
    return (a*t + b)*t*t + n;
}

// https://www.shadertoy.com/view/ldB3zc
vec3 distort(vec3 p, ivec2 texSize, int count) {
    float w = .05;
    float res = 1.;
    float minD = 10000.;
    vec2 nearestParticle = vec2(0.);

    for(int i=0; i<count; i++) {
        vec2 pi = texelFetch(u_particlePosTexture, ndx2tex(texSize, i), 0).xy;
        vec2 r = pi - p.xz;
        float d = distance( pi, p.xz );
        if (d < minD) {
            minD = d;
            nearestParticle = pi;
        }

        // do the smooth min for colors and distances		
		float h = smoothstep( -1., 1., (res-d)/w );
	    res = mix( res, d, h ) - h*(1.0-h)*w/(1.0+3.0*w);
    }

    res = clamp(res * 10., 0., 1.);
    res = almostIdentity(res, 0.15, 0.05);

    res = (1. - res);
    //res = pow(res, 1.6);
    res *= 0.25; // max height
    vec3 r = vec3(p.x, res, p.z);


    // smooth out edges
    float edge = smoothstep(0.5, .8, 1. - length(p));
    res *= edge;

    // spherical part
    vec3 sp = normalize(p - vec3(0., -.4, 0.)) * res;
    r = p + sp;



    return r;
}

void main() {
    ivec2 texSize = textureSize(u_particlePosTexture, 0);
    int particleCount = texSize.x * texSize.y;

    vec3 p = distort(position, texSize, particleCount);
    
    // temp normal extimation
    float epsilon = 0.001;
    vec3 t = distort(position + vec3(epsilon, 0., 0.), texSize, particleCount);
    vec3 b = distort(position + vec3(0., 0., epsilon), texSize, particleCount);
    v_normal = normalize(cross(t - p, b - p));

    v_texcoord = texcoord;
    v_position = position;
    gl_Position = u_projectionMatrix * u_viewMatrix * u_worldMatrix * vec4(p, 1.);
}
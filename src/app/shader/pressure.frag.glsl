
#version 300 es

precision highp float;

uniform sampler2D u_positionTexture;
uniform int u_particleCount;
uniform vec2 u_domainScale;

in vec2 v_uv;

out vec2 outDensityPressure;

ivec2 ndx2tex(ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return ivec2(x, y);
}

#define PI 3.1415926535

// SPH constants (TODO: move to uniform block)
const float H = 1.;
float HSQ = H * H;
float MASS = 1.;
float POLY6 = 315.0 / (64. * PI * pow(H, 9.));
float REST_DENS = 1.55;  // rest density
float GAS_CONST = 200.;

float poly6Weight(float r2) {
    float temp = max(0., HSQ - r2);
    return POLY6 * temp * temp * temp;
}

void main() {
    ivec2 particleTexDimensions = textureSize(u_positionTexture, 0);
    vec4 domainScale = vec4(u_domainScale, 0., 0.);

    vec4 pi = texture(u_positionTexture, v_uv) * domainScale;
    float rho = MASS * poly6Weight(0.);

    // loop over all other particles
    for(int i=0; i<u_particleCount; i++) {
        vec4 pj = texelFetch(u_positionTexture, ndx2tex(particleTexDimensions, i), 0) * domainScale;
        vec4 pij = pj - pi;

        float r2 = dot(pij, pij);
        if (r2 < HSQ) {
            float t = MASS * poly6Weight(r2);
            rho += t;
        }
    }

    float pressure = max(GAS_CONST * (rho - REST_DENS), 0.);

    outDensityPressure = vec2(rho, pressure);
}
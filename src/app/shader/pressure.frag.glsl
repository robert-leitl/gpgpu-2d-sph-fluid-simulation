
#version 300 es

precision highp float;

uniform sampler2D u_positionTexture;

layout(std140) uniform u_SimulationParams {
    float H;
    float HSQ;
    float MASS;
    float REST_DENS;
    float GAS_CONST;
    float VISC;
    float POLY6;
    float SPIKY_GRAD;
    float VISC_LAP;
    float POINTER_RADIUS;
    float POINTER_STRENGTH;
    int PARTICLE_COUNT;
    vec2 DOMAIN_SCALE;
};

in vec2 v_uv;

out vec2 outDensityPressure;

ivec2 ndx2tex(ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return ivec2(x, y);
}

float poly6Weight(float r2) {
    float temp = max(0., HSQ - r2);
    return POLY6 * temp * temp * temp;
}

void main() {
    ivec2 particleTexDimensions = textureSize(u_positionTexture, 0);
    vec4 domainScale = vec4(DOMAIN_SCALE, 0., 0.);

    vec4 pi = texture(u_positionTexture, v_uv) * domainScale;
    float rho = MASS * poly6Weight(0.);

    // loop over all other particles
    for(int i=0; i<PARTICLE_COUNT; i++) {
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

#version 300 es

precision highp float;

uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_densityPressureTexture;
uniform int u_particleCount;
uniform vec2 u_domainScale;

in vec2 v_uv;

out vec4 outForce;

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
float VISC = 10.;
float SPIKY_GRAD = -45.0 / (PI * pow(H, 6.));
float VISC_LAP = 45.0 / (PI * pow(H, 5.));

float spiky_grad2Weight(float r) {
    float temp = max(0., H - r);
    return (SPIKY_GRAD * temp * temp) / r;
}

float visc_laplWeight(float r) {
    return VISC_LAP * (1. - r / H);
}


void main() {
    ivec2 particleTexDimensions = textureSize(u_positionTexture, 0);
    vec4 domainScale = vec4(u_domainScale, 0., 0.);

    vec4 pi = texture(u_positionTexture, v_uv) * domainScale;
    vec4 vi = texture(u_velocityTexture, v_uv);
    vec2 ri = texture(u_densityPressureTexture, v_uv).xy;
    float pi_rho = ri.x;
    float pi_pressure = ri.y;
    vec4 force = vec4(0.);

    // loop over all other particles
    for(int i=0; i<u_particleCount; i++) {
        ivec2 pj_tex = ndx2tex(particleTexDimensions, i);
        vec4 pj = texelFetch(u_positionTexture, pj_tex, 0) * domainScale;
        vec4 pij = pj - pi;
        float r2 = dot(pij, pij);

        if (r2 < HSQ) {
            float r = sqrt(r2);

            if (r == 0.) continue;

            vec4 pressureForce = vec4(pij);
            vec4 viscosityForce = vec4(0.);

            vec2 rj = texelFetch(u_densityPressureTexture, pj_tex, 0).xy;
            float pj_rho = rj.x;
            float pj_pressure = rj.y;
            vec4 vj = texelFetch(u_velocityTexture, pj_tex, 0);

            // compute pressure force contribution
            float pF = MASS * ((pi_pressure + pj_pressure) / (2. * pj_rho)) * spiky_grad2Weight(r);
            pressureForce *= pF;

            // compute viscosity force contribution
            viscosityForce = (vj - vi) * (VISC * MASS * visc_laplWeight(r) / pj_rho);

            force += pressureForce + viscosityForce;
        }
    }

    pi /= domainScale;

    // compute boundary forces
    float xmin = -1.;
    float xmax = 1.;
    float ymin = -1.;
    float ymax = 1.;
    float h = H;
    float f = (MASS / (pi_rho + 0.0000000001)) * pi_pressure;

    if (pi.x < xmin + h) {
        float r = pi.x - xmin;
        force.x -= f * spiky_grad2Weight(r) * r;
    } else if (pi.x > xmax - h) {
        float r = xmax - pi.x;
        force.x += f * spiky_grad2Weight(r) * r;
    }
    if (pi.y < ymin + h) {
        float r = pi.y - ymin;
        force.y -= f * spiky_grad2Weight(r) * r;
    } else if (pi.y > ymax - h) {
        float r = ymax - pi.y;
        force.y += f * spiky_grad2Weight(r) * r;
    }

    outForce = vec4(force);
}

#version 300 es

precision highp float;
precision highp usampler2D;

uniform sampler2D u_positionTexture;
uniform usampler2D u_indicesTexture;
uniform usampler2D u_offsetTexture;
uniform ivec2 u_cellTexSize;
uniform float u_cellSize;

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

int tex2ndx(ivec2 dimensions, ivec2 tex) {
    return tex.x + tex.y * dimensions.x;
}

float poly6Weight(float r2) {
    float temp = max(0., HSQ - r2);
    return POLY6 * temp * temp * temp;
}

int pos2CellId(vec2 p, ivec2 cellTexSize, vec2 domainScale, float cellSize) {
    vec2 pi = p * 0.5 + 0.5;
    pi = clamp(pi, vec2(0.), vec2(1.));
    pi *= domainScale;
    return tex2ndx(cellTexSize, ivec2(floor(pi / cellSize)));
}

ivec2 pos2CellIndex(vec2 p, ivec2 cellTexSize, vec2 domainScale, float cellSize) {
    vec2 pi = p * 0.5 + 0.5;
    pi = clamp(pi, vec2(0.), vec2(1.));
    pi *= domainScale;
    return ivec2(floor(pi / cellSize));
}

void main() {
    ivec2 particleTexDimensions = textureSize(u_positionTexture, 0);
    vec4 domainScale = vec4(DOMAIN_SCALE, 0., 0.);
    int cellCount = u_cellTexSize.x * u_cellTexSize.y;

    vec4 p = texture(u_positionTexture, v_uv);
    vec4 pi = p * domainScale;
    float rho = MASS * poly6Weight(0.);

    // find the cell id of this particle
    ivec2 cellIndex = pos2CellIndex(p.xy, u_cellTexSize, domainScale.xy, u_cellSize);

    /*for(int i = -1; i <= 1; ++i)
    {
        for(int j = -1; j <= 1; ++j)
        {
            ivec2 neighborIndex = cellIndex + ivec2(i, j);            
            int neighborId = tex2ndx(u_cellTexSize, neighborIndex) % cellCount;
            
            // look up the offset to the cell:
            int neighborIterator = int(texelFetch(u_offsetTexture, ndx2tex(u_cellTexSize, neighborId), 0).x);

            // iterate through particles in the neighbour cell (if iterator offset is valid)
            while(neighborIterator != 1048576 && neighborIterator < PARTICLE_COUNT)
            {
                uvec4 indexData = texelFetch(u_indicesTexture, ndx2tex(particleTexDimensions, neighborIterator), 0);

                if(int(indexData.x) != neighborId) {
                    break;  // it means we stepped out of the neighbour cell list
                }

                // do density estimation
                uint pj_ndx = indexData.y;
                vec4 pj = texelFetch(u_positionTexture, ndx2tex(particleTexDimensions, int(pj_ndx)), 0) * domainScale;
                vec4 pij = pj - pi;

                float r2 = dot(pij, pij);
                if (r2 < HSQ) {
                    float t = MASS * poly6Weight(r2);
                    rho += t;
                }

                neighborIterator++;
            }
        }
    }*/

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
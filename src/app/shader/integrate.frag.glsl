
#version 300 es

precision highp float;

uniform sampler2D u_forceTexture;
uniform sampler2D u_positionTexture;
uniform sampler2D u_velocityTexture;
uniform sampler2D u_densityPressureTexture;
uniform vec2 u_pointerPos;
uniform vec2 u_pointerVelocity;
uniform float u_dt;
uniform vec2 u_domainScale;

in vec2 v_uv;

layout(location = 0) out vec4 outPosition;
layout(location = 1) out vec4 outVelocity;

void main() {
    ivec2 particleTexDimensions = textureSize(u_positionTexture, 0);
    vec4 domainScale = vec4(u_domainScale, 0., 0.);

    vec4 pi = texture(u_positionTexture, v_uv);
    vec4 vi = texture(u_velocityTexture, v_uv);
    vec4 fi = texture(u_forceTexture, v_uv);
    vec4 ri = texture(u_densityPressureTexture, v_uv);

    float dt = (u_dt * 0.001);
    float rho = ri.x + 0.000000001;
    vec4 ai = fi / rho;
    vi += ai * dt;


    // apply the pointer force
    vec4 pointerPos = vec4(u_pointerPos, 0., 0.);
    float pr = length(pointerPos.xy * domainScale.xy - pi.xy * domainScale.xy);
    if (pr < 0.7) {
        vi.xy += u_pointerVelocity * .01 * (1. - pr / 0.7);
    }


    pi += (vi + 0.5 * ai * dt) * dt;

    outPosition = pi;
    outVelocity = vi;

    float xmin = -1.;
    float xmax = 1.;
    float ymin = -1.;
    float ymax = 1.;
    float bounceFactor = 0.;
    float off = -0.0001;
    if (outPosition.x < xmin) {
        //outPosition.x = xmin + off;
        outVelocity.x *= bounceFactor;
    } else if (outPosition.x > xmax) {
        //outPosition.x = xmax - off;
        outVelocity.x *= bounceFactor;
    }
    if (outPosition.y < ymin) {
        //outPosition.y = ymin + off;
        outVelocity.y *= bounceFactor;
    } else if (outPosition.y > ymax) {
        //outPosition.y = ymax - off;
        outVelocity.y *= bounceFactor;
    }
}
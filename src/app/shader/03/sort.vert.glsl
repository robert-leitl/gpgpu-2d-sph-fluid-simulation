#version 300 es

in vec2 a_position;

flat out vec2 v_position;

void main() {
    gl_Position = vec4(a_position, 0., 1.);
    v_position = a_position;
}
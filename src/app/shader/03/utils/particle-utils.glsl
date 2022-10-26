
ivec2 ndx2tex(ivec2 dimensions, int index) {
    int y = index / dimensions.x;
    int x = index % dimensions.x;
    return ivec2(x, y);
}

int tex2ndx(ivec2 dimensions, ivec2 tex) {
    return tex.x + tex.y * dimensions.x;
}

int pos2CellId(vec2 p, ivec2 cellTexSize, vec2 domainScale, float cellSize) {
    vec2 pi = p * 0.5 + 0.5;
    pi = clamp(pi, vec2(0.), vec2(1.));
    pi *= domainScale;
    return tex2ndx(cellTexSize, ivec2(floor(pi / cellSize)));
    /*
    vec2 pi = p * 0.5;
    pi *= domainScale;
    return tex2ndx(cellTexSize, ivec2(floor(pi / cellSize)));*/
}

ivec2 pos2CellIndex(vec2 p, ivec2 cellTexSize, vec2 domainScale, float cellSize) {
    vec2 pi = p * 0.5 + 0.5;
    pi = clamp(pi, vec2(0.), vec2(1.));
    pi *= domainScale;
    return ivec2(floor(pi / cellSize));
}
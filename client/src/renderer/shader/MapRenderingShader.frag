#version 300 es

// Map base layer. Colour = palette colour of the tile type (foundation, gameplay-neutral).
// Visual T layer (optional): the class tile from the atlas, divided by its mean and multiplied into the palette
// colour, so the average colour stays the palette colour and only the texture detail is added.
// Atlas: 512 x 2048, class k in rows [k*512, (k+1)*512). Class order: plains, hills, mountains, water.

in mediump vec2 texture_pos;
uniform mediump usampler2D texture_data;
uniform lowp sampler2D palette_data;
uniform lowp sampler2D tile_atlas;
uniform lowp vec3 class_mean[4];
uniform lowp int tile_class[64];
uniform mediump vec2 map_size;
uniform mediump float tile_cells;
uniform lowp int textures_on;
out lowp vec4 outColor;

void main() {
    mediump int id = int(texture(texture_data, texture_pos).r);
    lowp vec4 col = texelFetch(palette_data, ivec2(id % 256, id / 256), 0);
    lowp int k = id < 64 ? tile_class[id] : -1;
    if (textures_on == 1 && k >= 0) {
        highp vec2 uv = fract(texture_pos * map_size / tile_cells);
        lowp vec3 t = texture(tile_atlas, vec2(uv.x, (float(k) + uv.y) / 4.0)).rgb;
        col.rgb *= t / class_mean[k];
    }
    outColor = col;
}

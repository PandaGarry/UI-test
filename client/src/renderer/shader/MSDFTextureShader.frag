#version 300 es

in mediump vec2 texture_pos;
in lowp float texture_blur;
uniform lowp sampler2D texture_data;
// 1 = draw the light halo (a wider band around the glyph), 0 = draw the dark text itself.
uniform lowp float halo;
in mediump vec3 texture_halo;
out lowp vec4 outColor;

void main() {
    lowp vec4 data = texture(texture_data, texture_pos);
    lowp float median = max(min(data.r, data.g), min(max(data.r, data.g), data.b));
    if (halo > 0.5) {
        // Halo: a band around the glyph in the owner's colour, so the dark name reads on any terrain and on water.
        lowp float h = smoothstep(0.1, 0.24, median);
        outColor = vec4(texture_halo, 0.95 * h);
        return;
    }
    lowp float opacity = smoothstep(min(.28, .3 - texture_blur * .3), max(.32, .3 + texture_blur * .25), median);
    outColor = vec4(0, 0, 0, opacity);
}

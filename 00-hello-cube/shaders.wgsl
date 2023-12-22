struct MvpMatrixBuffer {
    mvpMatrix: mat4x4<f32>,
}
@binding(0) @group(0) var<uniform> mvp : MvpMatrixBuffer;

struct VertexOut {
    @builtin(position) position: vec4f,
    @location(0) color: vec4f
}

@vertex
fn vertex_main(@location(0) position: vec4f, @location(1) color: vec4f) -> VertexOut {
    var output: VertexOut;
    output.position = mvp.mvpMatrix * position;
    output.color = color;
    return output;
}

@fragment
fn fragment_main(fragData: VertexOut) -> @location(0) vec4f {
    return fragData.color;
}

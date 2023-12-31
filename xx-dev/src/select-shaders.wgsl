struct Camera {
    // The View-Projection matrix
    vpMatrix: mat4x4f,
    // The position of the camera in world space
    cameraPosition: vec3f,
}
@group(0) @binding(0) var<uniform> camera : Camera;

struct ModelMatrices {
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
}
@group(1) @binding(0) var<uniform> matrices : ModelMatrices;

struct VertexOut {
    @builtin(position) clipPosition: vec4f,
    @location(0) @interpolate(flat) triangleId: u32,
}

@vertex
fn vertex_main(
    @location(0) modelPosition: vec3f,
    @builtin(vertex_index) vertexIndex: u32
) -> VertexOut {
    var out: VertexOut;

    let vec4WorldPosition = matrices.modelMatrix * vec4(modelPosition, 1.0);
    out.clipPosition = camera.vpMatrix * vec4WorldPosition;
    out.triangleId = vertexIndex / 3;

    return out;
}

@fragment
fn fragment_main(in: VertexOut) -> @location(0) u32 {
    return in.triangleId;
}
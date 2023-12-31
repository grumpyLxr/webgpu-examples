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

struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) texTangent: vec3f,
    @location(3) texBitangent: vec3f,

    @location(15) vertexType: i32,
}

const lineLength:f32 = 0.25;

@vertex
fn vertex_main(in: VertexIn) -> @builtin(position) vec4f {
    var vert = in.position;
    if in.vertexType == 1 {
        vert += (in.normal * lineLength);
    }

    let vec4WorldPosition = matrices.modelMatrix * vec4(vert, 1.0);
    var clipPosition = camera.vpMatrix * vec4WorldPosition;

    // Move the normals a little bit closer to the camera so that it passes the depth buffer test.
    // To do this we convert the z position from Clip-Space to NDC (normalized device coordinates)
    // that are between [0; 1].
    let ndcPositionZ = clipPosition.z / clipPosition.w;
    clipPosition.z = (ndcPositionZ - 0.01 * (1 - ndcPositionZ)) * clipPosition.w;

    return clipPosition;
}

@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4(0, 0.5, 1, 1);
}
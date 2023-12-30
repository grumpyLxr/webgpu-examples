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

@vertex
fn vertex_main(@location(0) modelPosition: vec3f) -> @builtin(position) vec4f {

    let vec4WorldPosition = matrices.modelMatrix * vec4(modelPosition, 1.0);
    var clipPosition = camera.vpMatrix * vec4WorldPosition;

    // Move the wireframe a little bit closer to the camera so that it passes the depth buffer test.
    // To do this we convert the z position from Clip-Space to NDC (normalized device coordinates)
    // that are between [0; 1].
    let ndcPositionZ = clipPosition.z / clipPosition.w;
    clipPosition.z = (ndcPositionZ - 0.01 * (1 - ndcPositionZ)) * clipPosition.w;

    return clipPosition;
}

@fragment
fn fragment_main() -> @location(0) vec4f {
    return vec4(1, 0.5, 0, 1);
}
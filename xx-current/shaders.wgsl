struct Uniforms {
    // The View-Projection matrix
    vpMatrix: mat4x4f,
    // The position of the camera in world space
    cameraPosition: vec3f
}
@group(0) @binding(0) var<uniform> uni : Uniforms;

struct Light {
    position: vec3f,
    color: vec3f,
    range: f32,
    ambientStrength: f32,
    diffuseStrength: f32,
    specularStrength: f32,
}
@group(0) @binding(1) var<uniform> light : Light;

struct ModelMatrices {
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
}
@group(1) @binding(0) var<uniform> matrices : ModelMatrices;

// Vertex Shader: ------------------------------------------------------------
struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) color: vec3f,
    @location(3) specularStrength: f32,
    @location(4) specularShininess: f32,
}

struct VertexOut {
    @builtin(position) clipPosition: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) normal: vec3f,
    @location(2) color: vec3f,
    @location(3) specularStrength: f32,
    @location(4) specularShininess: f32,
}

@vertex
fn vertex_main(in: VertexIn) -> VertexOut {
    var output: VertexOut;

    let vec4WorldPosition = matrices.modelMatrix * vec4(in.position, 1.0);
    output.clipPosition = uni.vpMatrix * vec4WorldPosition;
    output.worldPosition = vec3(vec4WorldPosition.xyz);

    // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
    // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
    // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/
    output.normal = matrices.normalMatrix * in.normal;

    output.color = in.color;
    output.specularStrength = in.specularStrength;
    output.specularShininess = in.specularShininess;

    return output;
}

// Fragment Shader: ------------------------------------------------------------
@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    // Local illumination with Blinn-Phong lighting in world space:
    let relativeLightPosition = light.position - in.worldPosition;
    let lightDistance = length(relativeLightPosition);

    var resultLightColor: vec3f;
    if light.range < lightDistance {
        resultLightColor = vec3(0.0, 0.0, 0.0);
    } else {
        let lightStrength = (light.range - lightDistance) / light.range; // linear falloff
        let lightDirection = normalize(relativeLightPosition);
        let fragmentNormal = normalize(in.normal);

        let ambientColor = light.color * light.ambientStrength;

        let diffuseFactor = max(dot(lightDirection, fragmentNormal), 0.0);
        let diffuseColor = light.color * light.diffuseStrength * diffuseFactor;

        let viewDirection = normalize(uni.cameraPosition - in.worldPosition);
        let halfwayDirection = normalize(lightDirection + viewDirection);
        let specularFactor = pow(max(dot(fragmentNormal, halfwayDirection), 0.0), in.specularShininess);
        let specularColor = light.color * in.specularStrength * light.specularStrength * specularFactor;

        resultLightColor = (ambientColor + diffuseColor + specularColor) * lightStrength;
    }

    return vec4(in.color * resultLightColor, 1.0);
}

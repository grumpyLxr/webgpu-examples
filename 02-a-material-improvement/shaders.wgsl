struct Camera {
    // The View-Projection matrix
    vpMatrix: mat4x4f,
    // The position of the camera in world space
    cameraPosition: vec3f,
    // Boolean values used to debug rendering
    useColorTexture: i32,
    useSpecularTexture: i32,
    useNormalTexture: i32,
}
@group(0) @binding(0) var<uniform> camera : Camera;

@group(0) @binding(1) var texSampler: sampler;
@group(0) @binding(2) var colorTexture: texture_2d<f32>;
@group(0) @binding(3) var specularTexture: texture_2d<f32>;
@group(0) @binding(4) var normalTexture: texture_2d<f32>;

struct ModelMatrices {
    modelMatrix: mat4x4f,
    normalMatrix: mat3x3f,
}
@group(1) @binding(0) var<uniform> matrices : ModelMatrices;

struct Light {
    position: vec3f,
    color: vec3f,
    range: f32,
    ambientStrength: f32,
    diffuseStrength: f32,
    specularStrength: f32,
}
@group(2) @binding(0) var<storage, read> lights : array<Light>;

// Vertex Shader: ------------------------------------------------------------
struct VertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) texTangent: vec3f,
    @location(3) texBitangent: vec3f,
    @location(4) texCoord: vec2f,
    @location(5) specularShininess: f32,
}

struct VertexOut {
    @builtin(position) clipPosition: vec4f,
    @location(0) worldPosition: vec3f,
    @location(1) normal: vec3f,
    @location(2) texTangent: vec3f,
    @location(3) texBitangent: vec3f,
    @location(4) texCoord: vec2f,
    @location(5) specularShininess: f32,
}

@vertex
fn vertex_main(in: VertexIn) -> VertexOut {
    var output: VertexOut;

    let vec4WorldPosition = matrices.modelMatrix * vec4(in.position, 1.0);
    output.clipPosition = camera.vpMatrix * vec4WorldPosition;
    output.worldPosition = vec3(vec4WorldPosition.xyz);

    // The normal vectors cannot be multiplied with the model matrix. If the model matrix 
    // performs non-uniform scaling, the normals would not be perpendicular to the surface anymore.
    // Thus we use a specual normal matrix.
    // See http://www.lighthouse3d.com/tutorials/glsl-12-tutorial/the-normal-matrix/.
    output.texTangent = normalize(matrices.normalMatrix * in.texTangent);
    output.texBitangent = normalize(matrices.normalMatrix * in.texBitangent);
    output.normal = normalize(matrices.normalMatrix * in.normal);

    output.texCoord = in.texCoord;
    output.specularShininess = in.specularShininess;

    return output;
}

// Fragment Shader: ------------------------------------------------------------

// Calculates the color contribution of a point light to a fragment.
// Local illumination with Blinn-Phong lighting in world space.
fn calcPointLight(
    light: Light,
    fragmentPosition: vec3f,
    fragmentNormal: vec3f,
    viewDirection: vec3f,
    matSpecularStrength: f32,
    matSpecularShininess: f32
) -> vec3f {
    const black = vec3(0.0, 0.0, 0.0);
    let relativeLightPosition = light.position - fragmentPosition;
    let lightDistance = length(relativeLightPosition);

    var resultLightColor: vec3f;
    if light.range < lightDistance {
        return black;
    } else {
        let lightStrength = (light.range - lightDistance) / light.range; // linear falloff
        let lightDirection = normalize(relativeLightPosition);

        let ambientColor = light.color * light.ambientStrength;

        let diffuseFactor = max(dot(lightDirection, fragmentNormal), 0.0);
        let diffuseColor = light.color * light.diffuseStrength * diffuseFactor;

        // Do not calculate the specular factor only if the light is behind the face.
        // This is why we check if the diffuseFactor is positive.
        var specularColor = black;
        if diffuseFactor > 0.0 {
            let halfwayDirection = normalize(lightDirection + viewDirection);
            let specularFactor = pow(max(dot(fragmentNormal, halfwayDirection), 0.0), matSpecularShininess);
            specularColor = light.color * matSpecularStrength * light.specularStrength * specularFactor;
        }

        return (ambientColor + diffuseColor + specularColor) * lightStrength;
    }
}

@fragment
fn fragment_main(in: VertexOut) -> @location(0) vec4f {
    let viewDirection = normalize(camera.cameraPosition - in.worldPosition);

    // we expect the specular strength to be in the red channel
    var specularStrength: f32;
    if camera.useSpecularTexture != 0 {
        specularStrength = textureSample(specularTexture, texSampler, in.texCoord).r;
    } else {
        specularStrength = 1.0;
    }

    let btnMatrix = mat3x3f(in.texTangent, in.texBitangent, in.normal);
    var normalMapNormal: vec3f;
    if camera.useNormalTexture != 0 {
        // Load normal from normal map texture and transform coordinates from [0.0, 1.0] to [-1.0, 1.0]. 
        // Normal Maps use the OpenGL coordinate system and to transfer them to the WebGPU/Vulkan 
        // coordinate system y has to be inverted.
        let normalMapColor = textureSample(normalTexture, texSampler, in.texCoord).rgb;
        normalMapNormal = normalize(normalMapColor * 2.0 - 1.0) * vec3(1.0, -1.0, 1.0);
        normalMapNormal = btnMatrix * normalMapNormal;
    } else {
        normalMapNormal = btnMatrix * vec3(0.0, 0.0, 1.0);
    }

    var lightColor = vec3(0.0, 0.0, 0.0);
    for (var i: u32 = 0; i < arrayLength(&lights); i += 1) {
        lightColor += calcPointLight(
            lights[i],
            in.worldPosition,
            normalMapNormal,
            viewDirection,
            specularStrength,
            in.specularShininess
        );
    }

    var matColor: vec4f;
    if camera.useColorTexture != 0 {
        matColor = textureSample(colorTexture, texSampler, in.texCoord);
    } else {
        matColor = vec4f(1.0, 1.0, 1.0, 1.0);
    }
    
    return matColor * vec4(lightColor, 1.0);
}

import {
  vec3,
  mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';
import { getViewProjectionMatrix } from './camera.js';
import { CubeMesh } from './CubeMesh.js';

// Clear color for GPURenderPassDescriptor
const clearColor = { r: 0.0, g: 0.5, b: 1.0, a: 1.0 };

// Vertex and fragment shaders

async function loadShaders() {
	var host = window.location.protocol + "//" + window.location.host;
	const response = await fetch(host + '/shaders.wgsl', {cache: "no-store"});
	const data = await response.text();
	return data;
}

// Main function

async function initGpuDevice() {
	// 1: request adapter and device
	if (!navigator.gpu) {
		throw Error('WebGPU not supported.');
	}

	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw Error('Couldn\'t request WebGPU adapter.');
	}

	const device = await adapter.requestDevice();
	return device;
}

async function initDrawingContext(gpuDevice) {
	// 2: Get reference to the canvas to render on
	const canvas = document.querySelector('#gpuCanvas');
	const context = canvas.getContext('webgpu');

	context.configure({
		device: gpuDevice,
		format: navigator.gpu.getPreferredCanvasFormat(),
		alphaMode: 'premultiplied'
	});

	return context
}


async function render(gpuDevice, drawingContext) {
	// 3: Create a shader module from the shaders template literal
	const shaders = await loadShaders();
	const shaderModule = gpuDevice.createShaderModule({
		code: shaders
	});

	// 4 (a): Create vertex buffer to contain vertex data
	const cubeMesh = new CubeMesh()
	const cubeVertices = cubeMesh.getVertices();
	const vertexBuffer = gpuDevice.createBuffer({
		size: cubeVertices.byteLength, // make it big enough to store vertices in
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});
	// Copy the vertex data over to the GPUBuffer using the writeBuffer() utility function
	gpuDevice.queue.writeBuffer(vertexBuffer, 0, cubeVertices, 0, cubeVertices.length);

	// 4 (b): Create vertex buffer to contain vertex data
	const triangles = cubeMesh.getTriangles();
	const indexBuffer = gpuDevice.createBuffer({
		size: triangles.byteLength,
		usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
	});
	// Copy the index data over to the GPUBuffer using the writeBuffer() utility function
	gpuDevice.queue.writeBuffer(indexBuffer, 0, triangles, 0, triangles.length);

	// 5: Create a GPUVertexBufferLayout and GPURenderPipelineDescriptor to provide a definition of our render pipline
	const vertexBuffers = [{
    	attributes: [{
      		shaderLocation: 0, // position
		    offset: 0,
			format: 'float32x4'
	    }, {
    		shaderLocation: 1, // color
		    offset: 16,
	    	format: 'float32x4'
		}],
		arrayStride: 32,
		stepMode: 'vertex'
	}];

	const pipelineDescriptor = {
		vertex: {
			module: shaderModule,
			entryPoint: 'vertex_main',
			buffers: vertexBuffers
		},
		fragment: {
			module: shaderModule,
			entryPoint: 'fragment_main',
			targets: [{
				format: navigator.gpu.getPreferredCanvasFormat()
			}]
		},
		primitive: {
			topology: 'triangle-list',
      		cullMode: 'back', // Backface culling
		},
		layout: 'auto'
	};

	// 6: Create the actual render pipeline
	const renderPipeline = gpuDevice.createRenderPipeline(pipelineDescriptor);

	// 6(b): View Transformation
	const mvpMatrixBuffer = gpuDevice.createBuffer({
    	size: 4 * 16, // 4x4 matrix
	    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const mvpMatrixBindGroup = gpuDevice.createBindGroup({
    	layout: renderPipeline.getBindGroupLayout(0),
	    entries: [
			{
				binding: 0,
				resource: { buffer: mvpMatrixBuffer },
			}
    	]
	});

	return {
		pipeline: renderPipeline,
		mvpMatrixBuffer, mvpMatrixBuffer,
		mvpMatrixBindGroup: mvpMatrixBindGroup,
		vertexBuffer: vertexBuffer,
		indexBuffer: indexBuffer,
		indexCount: cubeMesh.getTriangleCount() * 3
	}
}

async function frame(gpuDevice, drawingContext, renderContext) {
	const vpMatrix = getViewProjectionMatrix(drawingContext.canvas);
	const modelMatrix = mat4.identity();
	const rotation = Date.now() % 4000 / 4000 * (2 * Math.PI);
    mat4.rotate(
		modelMatrix,
		vec3.fromValues(1, 1, 0),
		rotation,
		modelMatrix
    );
	const mvpMatrix = mat4.multiply(vpMatrix, modelMatrix);

	gpuDevice.queue.writeBuffer(
		renderContext.mvpMatrixBuffer,
		0,
		mvpMatrix.buffer,
		mvpMatrix.byteOffset,
		mvpMatrix.byteLength
    );

	// 7: Create GPUCommandEncoder to issue commands to the GPU
	// Note: render pass descriptor, command encoder, etc. are destroyed after use, fresh one needed for each frame.
	const commandEncoder = gpuDevice.createCommandEncoder();

	// 8: Create GPURenderPassDescriptor to tell WebGPU which texture to draw into, then initiate render pass
	const renderPassDescriptor = {
	colorAttachments: [{
		clearValue: clearColor,
		loadOp: 'clear',
			storeOp: 'store',
			view: drawingContext.getCurrentTexture().createView()
    	}]
	};

	const passEncoder = commandEncoder.beginRenderPass(renderPassDescriptor);
    
	// 9: Draw the cube
	passEncoder.setPipeline(renderContext.pipeline);
	passEncoder.setBindGroup(0, renderContext.mvpMatrixBindGroup);
	passEncoder.setVertexBuffer(0, renderContext.vertexBuffer);
	passEncoder.setIndexBuffer(renderContext.indexBuffer, "uint16");
	passEncoder.drawIndexed(renderContext.indexCount);

	// End the render pass
	passEncoder.end();

	// 10: End frame by passing array of command buffers to command queue for execution
	gpuDevice.queue.submit([commandEncoder.finish()]);
}

async function main() {
	const gpuDevice = await initGpuDevice();
	const drawingContext = await initDrawingContext(gpuDevice);
	const renderContext = await render(gpuDevice, drawingContext);
	let timerId = setInterval(() => frame(gpuDevice, drawingContext, renderContext), 16);
}

main();

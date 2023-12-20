import {
    vec3,
    mat4,
} from 'https://wgpu-matrix.org/dist/2.x/wgpu-matrix.module.js';
import { Camera } from './Camera.js';
import { CubeMesh } from './CubeMesh.js';
import { InputState } from './InputHandler.js';

export class Scene {
    #camera = new Camera();
    #cube = new CubeMesh();

    getCamera() {
        return this.#camera;
    }

    getMesh() {
        return this.#cube;
    }

    getMeshModelMatrix() {
        const modelMatrix = mat4.identity();
        const rotation = Date.now() % 4000 / 4000 * (2 * Math.PI);
        mat4.rotate(
            modelMatrix,
            vec3.fromValues(1, 1, 0),
            rotation,
            modelMatrix
        );
        return modelMatrix;
    }

    /**
     * Updates the scene.
     * 
     * @param {InputState} inputState the user input between the last update and this update
     */
    updateScene(inputState) {
        // console.log("Input State:" + JSON.stringify(inputState));
        this.#camera.rotate(inputState.rotateLeftRight, inputState.rotateUpDown);
        this.#camera.move(
            (inputState.forward - inputState.backward) * 0.8,
            (inputState.right - inputState.left) * 0.8
        );
        if (inputState.resetCamera) {
            this.#camera.reset();
        }
    }
}

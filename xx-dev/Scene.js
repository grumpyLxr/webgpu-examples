import { vec3 } from './imports/wgpu-matrix.module.js';
import { Camera } from './Camera.js';
import { CubeMesh } from './CubeMesh.js';
import { Light } from './Light.js';
import { InputState } from './InputHandler.js';

export class Scene {
    #camera = new Camera(vec3.create(0.0, 0.0, -6.0));
    #cubes = [];
    #lights = [];

    constructor() {
        var c;
        c = new CubeMesh(32.0);
        this.#cubes.push(c);

        c = new CubeMesh(128.0);
        c.moveTo(vec3.create(-3.0, 0.0, 0.0));
        this.#cubes.push(c);

        c = new CubeMesh(2.0);
        c.moveTo(vec3.create(3.0, 0.0, 0.0));
        this.#cubes.push(c);

        var l;
        l = new Light(vec3.create(0, -2, -3), vec3.create(1.0, 1.0, 0.8), 8);
        this.#lights.push(l);

        l = new Light(vec3.create(0, -1, 3), vec3.create(0.4, 1.0, 0.4), 7);
        this.#lights.push(l);
    }

    getCamera() {
        return this.#camera;
    }

    /**
     * Returns an array with the mesh ojbects of the scene.
     * @returns {Array} an array of CubeMesh objects.
     */
    getMeshes() {
        return this.#cubes;
    }

    getLights() {
        return this.#lights;
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

        const rotation = Date.now() % 10000 / 10000 * (2 * Math.PI);
        this.#cubes[0].setRotation(vec3.fromValues(1, 1, 0), rotation)
    }
}

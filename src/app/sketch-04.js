import { mat4, vec2, vec3, vec4 } from "gl-matrix";
import { filter, fromEvent, merge, throwIfEmpty } from "rxjs";
import * as twgl from "twgl.js";

import drawVert from './shader/04/draw.vert.glsl';
import drawFrag from './shader/04/draw.frag.glsl';
import integrateVert from './shader/04/integrate.vert.glsl';
import integrateFrag from './shader/04/integrate.frag.glsl';
import pressureVert from './shader/04/pressure.vert.glsl';
import pressureFrag from './shader/04/pressure.frag.glsl';
import forceVert from './shader/04/force.vert.glsl';
import forceFrag from './shader/04/force.frag.glsl';
import spikesVert from './shader/04/spikes.vert.glsl';
import spikesFrag from './shader/04/spikes.frag.glsl';

export class Sketch {

    TARGET_FRAME_DURATION = 16;
    #time = 0; // total time
    #deltaTime = 0; // duration betweent the previous and the current animation frame
    #frames = 0; // total framecount according to the target frame duration
    // relative frames according to the target frame duration (1 = 60 fps)
    // gets smaller with higher framerates --> use to adapt animation timing
    #deltaFrames = 0;

    // particle constants
    NUM_PARTICLES = 100;

    // spikes plane properties
    PLANE_SIZE = 1;

    simulationParams = {
        H: 1, // kernel radius
        MASS: 1, // particle mass
        REST_DENS: 1.55, // rest density
        GAS_CONST: 200, // gas constant
        VISC: 10, // viscosity constant

        // these are calculated from the above constants
        POLY6: 0,
        HSQ: 0,
        SPIKY_GRAD: 0,
        VISC_LAP: 0,

        PARTICLE_COUNT: 0,
        DOMAIN_SCALE: 0,

        STEPS: 0
    };

    pointerParams = {
        RADIUS: 2,
        STRENGTH: 10,
    }

    camera = {
        matrix: mat4.create(),
        near: .1,
        far: 5,
        fov: Math.PI / 4,
        aspect: 1,
        position: vec3.fromValues(0, .5, 1),
        up: vec3.fromValues(0, 1, 0),
        matrices: {
            view: mat4.create(),
            projection: mat4.create(),
            inversProjection: mat4.create(),
            inversViewProjection: mat4.create()
        }
    };

    constructor(canvasElm, onInit = null, isDev = false, pane = null) {
        this.canvas = canvasElm;
        this.onInit = onInit;
        this.isDev = isDev;
        this.pane = pane;

        this.#init();
    }

    run(time = 0) {
        this.#deltaTime = Math.min(16, time - this.#time);
        this.#time = time;
        this.#deltaFrames = this.#deltaTime / this.TARGET_FRAME_DURATION;
        this.#frames += this.#deltaFrames;

        this.#animate(this.#deltaTime);
        this.#render();

        requestAnimationFrame((t) => this.run(t));
    }

    resize() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.viewportSize = vec2.set(
            this.viewportSize,
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        // the domain scale reflects the aspect ratio within the simulation
        this.domainScale = vec2.copy(vec2.create(), this.viewportSize);
        const maxSize = Math.max(this.domainScale[0], this.domainScale[1]) * 1.;
        this.domainScale[0] /= maxSize;
        this.domainScale[1] /= maxSize;
        // fix the domain scale to the aspect of the spikes plane
        vec2.set(this.domainScale, 1, 1);
        vec2.scale(this.domainScale, this.domainScale, 5.);
        this.simulationParams.DOMAIN_SCALE = this.domainScale;
        this.simulationParamsNeedUpdate = true;

        const needsResize = twgl.resizeCanvasToDisplaySize(this.canvas);

        if (needsResize) {
            gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
        }

        this.#updateProjectionMatrix(gl);
    }

    #init() {
        this.gl = this.canvas.getContext('webgl2', { antialias: false, alpha: false });

        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        twgl.addExtensionsToContext(gl);

        this.viewportSize = vec2.fromValues(
            this.canvas.clientWidth,
            this.canvas.clientHeight
        );

        this.#initTextures();

        // Setup Programs
        this.drawPrg = twgl.createProgramInfo(gl, [drawVert, drawFrag]);
        this.integratePrg = twgl.createProgramInfo(gl, [integrateVert, integrateFrag]);
        this.pressurePrg = twgl.createProgramInfo(gl, [pressureVert, pressureFrag]);
        this.forcePrg = twgl.createProgramInfo(gl, [forceVert, forceFrag]);
        this.spikesPrg = twgl.createProgramInfo(gl, [spikesVert, spikesFrag]);

        // Setup uinform blocks
        this.simulationParamsUBO = twgl.createUniformBlockInfo(gl, this.pressurePrg, 'u_SimulationParams');
        this.pointerParamsUBO = twgl.createUniformBlockInfo(gl, this.integratePrg, 'u_PointerParams');
        this.simulationParamsNeedUpdate = true;

        // Setup Meshes
        this.quadBufferInfo = twgl.createBufferInfoFromArrays(gl, { a_position: { numComponents: 2, data: [-1, -1, 3, -1, -1, 3] }});
        this.quadVAO = twgl.createVAOAndSetAttributes(gl, this.pressurePrg.attribSetters, this.quadBufferInfo.attribs, this.quadBufferInfo.indices);
        const spikesArrays = twgl.primitives.createPlaneVertices(this.PLANE_SIZE, this.PLANE_SIZE, 228, 228);
        this.spikesBufferInfo = twgl.createBufferInfoFromArrays(gl, spikesArrays);
        this.spikesVAO = twgl.createVAOAndSetAttributes(gl, this.spikesPrg.attribSetters, this.spikesBufferInfo.attribs, this.spikesBufferInfo.indices);
        this.spikesWorldMatrix = mat4.create();

        // Setup Framebuffers
        this.pressureFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.densityPressure}], this.textureSize, this.textureSize);
        this.forceFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.force}], this.textureSize, this.textureSize);
        this.inFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.position1},{attachment: this.textures.velocity1}], this.textureSize, this.textureSize);
        this.outFBO = twgl.createFramebufferInfo(gl, [{attachment: this.textures.position2},{attachment: this.textures.velocity2}], this.textureSize, this.textureSize);

        this.#initEvents();
        this.#updateSimulationParams();
        this.#initTweakpane();
        this.#updateCameraMatrix();
        this.#updateProjectionMatrix(gl);

        this.resize();
        
        if (this.onInit) this.onInit(this);
    }

    #initEvents() {
        this.isPointerDown = false;
        this.pointer = vec2.create();
        this.pointerLerp = vec2.create();
        this.pointerLerpPrev = vec2.create();
        this.pointerLerpDelta = vec2.create();

        fromEvent(this.canvas, 'pointerdown').subscribe((e) => {
            this.isPointerDown = true;
            this.pointer = this.#getNormalizedPointerCoords(e);
            this.pointer = this.#getPointerSpikesPlaneIntersection();
            vec2.copy(this.pointerLerp, this.pointer);
            vec2.copy(this.pointerLerpPrev, this.pointerLerp);
        });
        merge(
            fromEvent(this.canvas, 'pointerup'),
            fromEvent(this.canvas, 'pointerleave')
        ).subscribe(() => this.isPointerDown = false);
        fromEvent(this.canvas, 'pointermove').pipe(
            filter(() => this.isPointerDown)
        ).subscribe((e) => {
            this.pointer = this.#getNormalizedPointerCoords(e);
            this.pointer = this.#getPointerSpikesPlaneIntersection();
        });
    }

    #updateSimulationParams() {
        const sim = this.simulationParams
        sim.HSQ = sim.H * sim.H;
        sim.POLY6 = 315.0 / (64. * Math.PI * Math.pow(sim.H, 9.));
        sim.SPIKY_GRAD = -45.0 / (Math.PI * Math.pow(sim.H, 6.));
        sim.VISC_LAP = 45.0 / (Math.PI * Math.pow(sim.H, 5.));

        this.simulationParamsNeedUpdate = true;
    }

    #getNormalizedPointerCoords(e) {
        return vec2.fromValues(
            (e.clientX / this.viewportSize[0]) * 2. - 1, 
            (1 - (e.clientY / this.viewportSize[1])) * 2. - 1
        );
    }

    #initTextures() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        this.textureSize = 2**Math.ceil(Math.log2(Math.sqrt(this.NUM_PARTICLES)));

        // update the particle size to fill the texture space
        this.NUM_PARTICLES = this.textureSize * this.textureSize;
        this.simulationParams.PARTICLE_COUNT = this.NUM_PARTICLES;
        this.simulationParamsNeedUpdate = true;

        const initVelocities = new Float32Array(this.NUM_PARTICLES * 4);
        const initForces = new Float32Array(this.NUM_PARTICLES * 4);
        const initPositions = new Float32Array(this.NUM_PARTICLES * 4);

        for(let i=0; i<this.NUM_PARTICLES; ++i) {
            initVelocities[i * 4 + 0] = 0;
            initVelocities[i * 4 + 1] = 0;
            initPositions[i * 4 + 0] = Math.random() * 3 - 1.5;
            initPositions[i * 4 + 1] = Math.random() * 3 - 1.5;
        }

        const defaultOptions = {
            width: this.textureSize,
            height: this.textureSize,
            min: gl.NEAREST, 
            mag: gl.NEAREST,
        }

        const defaultVectorTexOptions = {
            ...defaultOptions,
            format: gl.RGBA,
            internalFormat: gl.RGBA32F, 
        }

        this.textures = twgl.createTextures(gl, { 
            densityPressure: {
                ...defaultOptions,
                format: gl.RG, 
                internalFormat: gl.RG32F, 
                src: new Float32Array(this.NUM_PARTICLES * 2)
            },
            force: { ...defaultVectorTexOptions, src: [...initForces] },
            position1: { ...defaultVectorTexOptions, src: [...initPositions] },
            position2: { ...defaultVectorTexOptions, src: [...initPositions] },
            velocity1: { ...defaultVectorTexOptions, src: [...initVelocities] },
            velocity2: { ...defaultVectorTexOptions, src: [...initVelocities] },
        });

        this.currentPositionTexture = this.textures.position2;
        this.currentVelocityTexture = this.textures.velocity2;
    }

    #initTweakpane() {
        if (!this.pane) return;

        const sim = this.pane.addFolder({ title: 'Simulation' });
        sim.addInput(this.simulationParams, 'H', { min: 0.01, max: 1, });
        sim.addInput(this.simulationParams, 'MASS', { min: 0.01, max: 5, });
        sim.addInput(this.simulationParams, 'REST_DENS', { min: 0.1, max: 5, });
        sim.addInput(this.simulationParams, 'GAS_CONST', { min: 10, max: 500, });
        sim.addInput(this.simulationParams, 'VISC', { min: 1, max: 20, });
        sim.addInput(this.simulationParams, 'STEPS', { min: 0, max: 6, step: 1 });

        const pointer = this.pane.addFolder({ title: 'Pointer' });
        pointer.addInput(this.pointerParams, 'RADIUS', { min: 0.1, max: 5, });
        pointer.addInput(this.pointerParams, 'STRENGTH', { min: 1, max: 35, });

        sim.on('change', () => this.#updateSimulationParams());
        pointer.on('change', () => this.pointerParamsNeedUpdate = true);
    }

    #updatePointer() {
        this.pointerLerp[0] += (this.pointer[0] - this.pointerLerp[0]) / 5;
        this.pointerLerp[1] += (this.pointer[1] - this.pointerLerp[1]) / 5;

        vec2.subtract(this.pointerLerpDelta, this.pointerLerp, this.pointerLerpPrev);
        vec2.copy(this.pointerLerpPrev, this.pointerLerp);
    }

    #simulate(deltaTime) {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        if (this.simulationParamsNeedUpdate) {
            twgl.setBlockUniforms(
                this.simulationParamsUBO,
                this.simulationParams
            );
            twgl.setUniformBlock(gl, this.pressurePrg, this.simulationParamsUBO);
            this.simulationParamsNeedUpdate = false;
        } else {
            twgl.bindUniformBlock(gl, this.pressurePrg, this.simulationParamsUBO);
        }


        // calculate density and pressure for every particle
        gl.useProgram(this.pressurePrg.program);
        twgl.bindFramebufferInfo(gl, this.pressureFBO);
        gl.bindVertexArray(this.quadVAO)
        twgl.setUniforms(this.pressurePrg, { u_positionTexture: this.inFBO.attachments[0] });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        // calculate pressure-, viscosity- and boundary forces for every particle
        gl.useProgram(this.forcePrg.program);
        twgl.bindFramebufferInfo(gl, this.forceFBO);
        twgl.setBuffersAndAttributes(gl, this.forcePrg, this.quadBufferInfo);
        twgl.setUniforms(this.forcePrg, { 
            u_densityPressureTexture: this.pressureFBO.attachments[0],
            u_positionTexture: this.inFBO.attachments[0], 
            u_velocityTexture: this.inFBO.attachments[1]
        });
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        // perform the integration to update the particles position and velocity
        gl.useProgram(this.integratePrg.program);
        twgl.bindFramebufferInfo(gl, this.outFBO);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        twgl.setBuffersAndAttributes(gl, this.integratePrg, this.quadBufferInfo);
        twgl.setUniforms(this.integratePrg, { 
            u_positionTexture: this.inFBO.attachments[0], 
            u_velocityTexture: this.inFBO.attachments[1],
            u_forceTexture: this.forceFBO.attachments[0],
            u_densityPressureTexture: this.pressureFBO.attachments[0],
            u_pointerPos: this.pointerLerp,
            u_pointerVelocity: this.pointerLerpDelta,
            u_dt: deltaTime,
            u_domainScale: this.domainScale
        });
        twgl.setBlockUniforms(
            this.pointerParamsUBO,
            {
                pointerRadius: this.pointerParams.RADIUS,
                pointerStrength: this.pointerParams.STRENGTH,
                pointerPos: this.pointerLerp,
                pointerVelocity: this.pointerLerpDelta
            } 
        );
        twgl.setUniformBlock(gl, this.integratePrg, this.pointerParamsUBO);
        twgl.drawBufferInfo(gl, this.quadBufferInfo);

        // update the current result textures
        this.currentPositionTexture = this.outFBO.attachments[0];
        this.currentVelocityTexture = this.outFBO.attachments[1];

        // swap the integrate FBOs
        const tmp = this.inFBO;
        this.inFBO = this.outFBO;
        this.outFBO = tmp;
    }

    #animate(deltaTime) {
        this.#updatePointer();


        // use a fixed deltaTime of 10 ms adapted to
        // device frame rate
        deltaTime = 10 * this.#deltaFrames;

        // simulate at least once
        this.#simulate(deltaTime);

        // clear the pointer force so that it wont add up during
        // subsequent simulation steps
        vec2.set(this.pointerLerpDelta, 0, 0);

        // additional simulation steps
        for(let i=0; i<this.simulationParams.STEPS; ++i) {
            this.#simulate(deltaTime);
        }
    }

    #render() {
        /** @type {WebGLRenderingContext} */
        const gl = this.gl;

        /*twgl.bindFramebufferInfo(gl, null);
        gl.disable(gl.CULL_FACE);
        gl.disable(gl.DEPTH_TEST);
        gl.clearColor(0., 0., 0., 1.);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.DST_ALPHA);

        gl.useProgram(this.drawPrg.program);
        twgl.setUniforms(this.drawPrg, { 
            u_positionTexture: this.currentPositionTexture,
            u_velocityTexture: this.currentVelocityTexture,
            u_resolution: this.viewportSize
        });
        gl.drawArrays(gl.POINTS, 0, this.NUM_PARTICLES);
        gl.disable(gl.BLEND);*/

        twgl.bindFramebufferInfo(gl, null);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.clearColor(0., 0., 0., 1.);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.spikesPrg.program);
        twgl.setUniforms(this.spikesPrg, {
            u_worldMatrix: this.spikesWorldMatrix,
            u_viewMatrix: this.camera.matrices.view,
            u_projectionMatrix: this.camera.matrices.projection,
            u_particlePosTexture: this.currentPositionTexture
        });
        gl.bindVertexArray(this.spikesVAO);
        gl.drawElements(gl.TRIANGLES, this.spikesBufferInfo.numElements, gl.UNSIGNED_SHORT, 0);
    }

    #updateCameraMatrix() {
        mat4.targetTo(this.camera.matrix, this.camera.position, [0, 0, 0], this.camera.up);
        mat4.invert(this.camera.matrices.view, this.camera.matrix);
    }

    #updateProjectionMatrix(gl) {
        this.camera.aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;

        const height = .6;
        const distance = this.camera.position[2];
        if (this.camera.aspect > 1) {
            this.camera.fov = 2 * Math.atan( height / distance );
        } else {
            this.camera.fov = 2 * Math.atan( (height / this.camera.aspect) / distance );
        }

        mat4.perspective(this.camera.matrices.projection, this.camera.fov, this.camera.aspect, this.camera.near, this.camera.far);
        mat4.invert(this.camera.matrices.inversProjection, this.camera.matrices.projection);
        mat4.multiply(this.camera.matrices.inversViewProjection, this.camera.matrix, this.camera.matrices.inversProjection)
    }

    #getPointerSpikesPlaneIntersection() {
        const p = this.#screenToWorldPosition(this.pointer[0], this.pointer[1], 0);
        const ray = vec3.subtract(vec3.create(), p, this.camera.position);
        const t = - this.camera.position[1] / ray[1];
        vec3.scale(ray, ray, t);
        const i = vec3.add(vec3.create(), this.camera.position, ray);
        vec3.scale(i, i, this.PLANE_SIZE);
        // swap z with y to match simulation plane
        return vec3.fromValues(i[0], i[2], 0);
    }

    #screenToWorldPosition(x, y, z) {
        const ndcPos = vec3.fromValues(x, y, z); 
        const worldPos = vec4.transformMat4(vec4.create(), vec4.fromValues(ndcPos[0], ndcPos[1], ndcPos[2], 1), this.camera.matrices.inversViewProjection);
        if (worldPos[3] !== 0){
            vec4.scale(worldPos, worldPos, 1 / worldPos[3]);
        }

        return worldPos;
    }
}
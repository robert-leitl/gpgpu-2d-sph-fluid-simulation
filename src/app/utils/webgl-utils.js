export function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);

    if (success) {
        return shader;
    }

    console.error(gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
}

export function createProgram(gl, shaderSources, transformFeedbackVaryings, attribLocations) {
    const program = gl.createProgram();

    [gl.VERTEX_SHADER, gl.FRAGMENT_SHADER].forEach((type, ndx) => {
        const shader = createShader(gl, type, shaderSources[ndx]);
        gl.attachShader(program, shader);
    });

    if (transformFeedbackVaryings) {
        gl.transformFeedbackVaryings(program, transformFeedbackVaryings, gl.SEPARATE_ATTRIBS);
    }

    if (attribLocations) {
        for(const attrib in attribLocations) {
            gl.bindAttribLocation(program, attribLocations[attrib], attrib);
        }
    }

    gl.linkProgram(program);
    const success = gl.getProgramParameter(program, gl.LINK_STATUS);

    if (success) {
        return program;
    }

    console.error(gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
}

export function makeVertexArray(gl, bufLocNumElmPairs, indices) {
    const va = gl.createVertexArray();
    gl.bindVertexArray(va);
    for (const [buffer, loc, numElem] of bufLocNumElmPairs) {
        if(loc == -1) continue;

        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(
            loc,      // attribute location
            numElem,  // number of elements
            gl.FLOAT, // type of data
            false,    // normalize
            0,        // stride (0 = auto)
            0,        // offset
        );
    }
    if (indices) {
        const indexBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
    }

    gl.bindVertexArray(null);
    return va;
}

export function resizeCanvasToDisplaySize(canvas) {
    const dpr = Math.min(1, window.devicePixelRatio);

    // Lookup the size the browser is displaying the canvas in CSS pixels.
    const displayWidth  = Math.round(canvas.clientWidth * dpr);
    const displayHeight = Math.round(canvas.clientHeight * dpr);
   
    // Check if the canvas is not the same size.
    const needResize = canvas.width  !== displayWidth ||
                       canvas.height !== displayHeight;
   
    if (needResize) {
      // Make the canvas the same size
      canvas.width  = displayWidth;
      canvas.height = displayHeight;
    }
   
    return needResize;
}

export function makeBuffer(gl, sizeOrData, usage) {
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, sizeOrData, usage);
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    return buf;
}

export function makeTransformFeedback(gl, buffers) {
    const tf = gl.createTransformFeedback();
    gl.bindTransformFeedback(gl.TRANSFORM_FEEDBACK, tf);
    buffers.forEach((buffer, ndx) => 
        gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, ndx, buffer)
    );
    return tf;
}

export function createFramebuffer(gl, colorAttachements, depthAttachement) {
    const fbo = gl.createFramebuffer();
    const drawBuffers = [];
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    colorAttachements.forEach((texture, ndx) => {
        const attachmentPoint = gl[`COLOR_ATTACHMENT${ndx}`];
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,
            attachmentPoint,
            gl.TEXTURE_2D, 
            texture,
            0);
        drawBuffers.push(attachmentPoint);
    });
    if (depthAttachement) {
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthAttachement, 0);
    }
    gl.drawBuffers(drawBuffers);

    if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) != gl.FRAMEBUFFER_COMPLETE) {
        console.error('could not complete render framebuffer setup', gl.checkFramebufferStatus(gl.FRAMEBUFFER))
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return fbo;
}

export function setFramebuffer(gl, fbo, width, height) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); // all draw commands will affect the framebuffer
    gl.viewport(0, 0, width, height);
}

export function createAndSetupTexture(gl, minFilter, magFilter, wrapS, wrapT) {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);
    return texture;
}
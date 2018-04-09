var Denoiser = function(renderer){
	this.renderer = renderer;

	this.viewScene = new THREE.Scene();
	this.viewScene.background = new THREE.Color(0,0,0);
	this.viewCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	this.viewCamera.position.set( 0, 0, 1 );

	var quad = new THREE.PlaneBufferGeometry( 2 , 2 );
	var viewMaterial = new THREE.ShaderMaterial({
		uniforms : {
			buffer : { value : null },
		},
		vertexShader : DenoiserShader.vertexShader,
		fragmentShader : DenoiserShader.debugFragmentShader
	});

	this.viewQuad = new THREE.Mesh(quad, viewMaterial);
	this.viewScene.add(this.viewQuad);

	this.config = {
		avg : 6,
		max : 12,
		min : 12,
	};

};


Denoiser.prototype = {
	init : function(){
		this.renderer.setSize(this.width, this.height);
		this.avgReadBuffer =  new THREE.WebGLRenderTarget( this.width, this.height, {
			wrapS: THREE.ClampToEdgeWrapping,
			wrapT: THREE.ClampToEdgeWrapping,
			minFilter: THREE.NearestFilter,
			magFilter: THREE.NearestFilter,
			format: THREE.RGBAFormat,
			type: THREE.FloatType,
			stencilBuffer: false,
			depthBuffer: false
		});

		this.avgWriteBuffer = this.avgReadBuffer.clone();
		this.minWriteBuffer = this.avgReadBuffer.clone();
		this.minReadBuffer = this.avgReadBuffer.clone();
		this.maxWriteBuffer = this.avgReadBuffer.clone();
		this.maxReadBuffer = this.avgReadBuffer.clone();

		var data = new Float32Array( 4 );
		data[0] = 0;data[1] = 0;data[2] = 0;data[3] = 0;
		
		this.defaultTexture = new THREE.DataTexture( data, 1, 1, THREE.RGBAFormat, THREE.FloatType );

		this.avgFrame = 0;
		this.minFrame = 0;
		this.maxFrame = 0;

	},
	avg : function(){

		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				noiseBuffer : { value : this.input },
				avgBuffer : { value : this.avgFrame == 0 ?this.defaultTexture : this.avgReadBuffer.texture },
				frame : { value : this.avgFrame },
				resolution : { value : new THREE.Vector2(this.width, this.height) },
			},
			vertexShader : DenoiserShader.vertexShader,
			fragmentShader : DenoiserShader.avgShader,
		});

		this.renderer.render(this.viewScene, this.viewCamera, this.avgWriteBuffer);
		var temp = this.avgWriteBuffer;
		this.avgWriteBuffer = this.avgReadBuffer;
		this.avgReadBuffer = temp;
		this.avgFrame++;

	},
	max : function(){
		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				noiseBuffer : { value : this.input },
				inputBuffer : { value : this.maxFrame === 0 ? this.defaultTexture: this.maxReadBuffer.texture},
				avgBuffer : { value : this.avgReadBuffer.texture },
				frame : { value : this.maxFrame },
				resolution : { value : new THREE.Vector2(this.width, this.height) },
			},
			vertexShader : DenoiserShader.vertexShader,
			fragmentShader : DenoiserShader.maxShader,
		});

		this.renderer.render(this.viewScene, this.viewCamera, this.maxWriteBuffer);
		var temp = this.maxWriteBuffer;
		this.maxWriteBuffer = this.maxReadBuffer;
		this.maxReadBuffer = temp;
		this.maxFrame++;
	},
	min : function(){
		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				noiseBuffer : { value : this.input },
				inputBuffer : { value : this.minFrame === 0 ? this.defaultTexture: this.minReadBuffer.texture},
				avgBuffer : { value : this.avgReadBuffer.texture },
				frame : { value : this.minFrame },
				resolution : { value : new THREE.Vector2(this.width, this.height) },
			},
			vertexShader : DenoiserShader.vertexShader,
			fragmentShader : DenoiserShader.minShader,
		});

		this.renderer.render(this.viewScene, this.viewCamera, this.minWriteBuffer);
		var temp = this.minWriteBuffer;
		this.minWriteBuffer = this.minReadBuffer;
		this.minReadBuffer = temp;
		this.minFrame++;
	},
	setInput : function(input){
		if(input instanceof THREE.WebGLRenderTarget){
			this.input = input.texture;
			this.width = input.width;
			this.height = input.height;
		}else if(input instanceof THREE.Texture){
			this.input = input;
			this.width = input.image.width;
			this.height = input.image.height;
		}else{
			throw 'Input Error';
		}
		this.init();
	},
	denoise : function(input){
		if(this.avgFrame <= this.config.avg){
			console.log(this.avgFrame);

			this.avg();
		}else if(this.maxFrame <= this.config.max){
			this.max();
		}else if(this.minFrame <= this.config.min){
			this.min();
		}else if(this.end === undefined){
			this.viewQuad.material = new THREE.ShaderMaterial({
				uniforms : {
					noiseBuffer : { value : this.input },

					max : {value : this.maxReadBuffer},
					min : {value : this.minReadBuffer},

					avgBuffer : { value : this.avgReadBuffer.texture },
					frame : { value : this.minFrame },
					resolution : { value : new THREE.Vector2(this.width, this.height) },
				},
				vertexShader : DenoiserShader.vertexShader,
				fragmentShader : DenoiserShader.mainShader,
			});

			this.renderer.render(this.viewScene, this.viewCamera, this.minWriteBuffer);
			this.end = true;
			this.debug(this.minWriteBuffer);
		}else{
			return;
		}

		var self = this;
		requestAnimationFrame(function(){
			self.denoise();
		});

	},
	debug : function(renderTarget){
		this.viewQuad.material = new THREE.ShaderMaterial({
			uniforms : {
				buffer : { value : renderTarget.texture },
			},
			vertexShader : DenoiserShader.vertexShader,
			fragmentShader : DenoiserShader.debugFragmentShader
		});

		this.renderer.render(this.viewScene, this.viewCamera);

	}

};

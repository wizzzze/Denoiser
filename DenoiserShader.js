var DenoiserShader = {
	vertexShader : `
varying vec2 vUv;

void main(){
	vUv = uv;
	gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
}

`,
	maxShader : `

uniform sampler2D noiseBuffer;
uniform sampler2D inputBuffer;
uniform sampler2D avgBuffer;

uniform vec2 resolution;
uniform int frame;

#define GX texture2D(noiseBuffer, uv + i * step)
#define GY texture2D(inputBuffer, uv + i * step)

#define STDEV 6.5
#define RADIUS 12.0

#define GAMMA vec4(1.0)
#define ZERO vec4(0.0)

float gaussian(float x) {
    return exp(-x*x/(STDEV*STDEV));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    vec2 ix = vec2(1.0 / resolution.x, 0.0);
    vec2 iy = vec2(0.0, 1.0 / resolution.y);

    bool xpass = mod(float(frame), 2.0) < 1.0;
    
    vec2 step = xpass ? ix : iy;

    vec4 maxG = vec4(0.0);
    vec4 denomMax = vec4(0.0);
    
    vec4 mid = texture2D(noiseBuffer, uv);
    
    for (float i = -RADIUS; i <= RADIUS; i += 1.0) {
        vec4 g = vec4(gaussian(i));
        vec4 s = pow(texture2D(avgBuffer, uv + i * step), GAMMA);
        vec4 v = pow(xpass ? GX : GY, GAMMA);
       	
        vec4 gt = xpass ? vec4(length(v) >= length(s) ? 1 : 0) : vec4(1);
        maxG += mix(ZERO, g*v, gt);
        denomMax += mix(ZERO, g, gt);		
    }
    
    vec4 sg = pow(texture2D(avgBuffer, uv), GAMMA);
    
    vec4 maxNorm = maxG / denomMax;
    maxG = pow(maxNorm, 1.0 / GAMMA);
    gl_FragColor = clamp(maxG, 0.0, 1.0);
}
	`,
	minShader : `

uniform sampler2D noiseBuffer;
uniform sampler2D inputBuffer;
uniform sampler2D avgBuffer;

uniform vec2 resolution;
uniform int frame;

#define GX texture2D(noiseBuffer, uv + i * step)
#define GY texture2D(inputBuffer, uv + i * step)

#define STDEV 6.5
#define RADIUS 12.0

#define GAMMA vec4(1.0)
#define ZERO vec4(0.0)

float gaussian(float x) {
    return exp(-x*x/(STDEV*STDEV));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    vec2 ix = vec2(1.0 / resolution.x, 0.0);
    vec2 iy = vec2(0.0, 1.0 / resolution.y);

    bool xpass = mod(float(frame), 2.0) < 1.0;
    
    vec2 step = xpass ? ix : iy;

    vec4 minG = vec4(0.0);
    vec4 denomMin = vec4(0.0);
    
    vec4 mid = texture2D(noiseBuffer, uv);
    
    for (float i = -RADIUS; i <= RADIUS; i += 1.0) {
        vec4 g = vec4(gaussian(i));
        vec4 s = pow(texture2D(avgBuffer, uv + i * step), GAMMA);
        vec4 v = pow(xpass ? GX : GY, GAMMA);
       	
        vec4 lt = xpass ? vec4(length(v) <= length(s) ? 1 : 0) : vec4(1);
        minG += mix(ZERO, g*v, lt);
        denomMin += mix(ZERO, g, lt);	
		
    }
    
    vec4 sg = pow(texture2D(avgBuffer, uv), GAMMA);
    
    vec4 minNorm = minG / denomMin;
    minG = pow(min(minNorm, sg), 1.0 / GAMMA);
    gl_FragColor = clamp(minG, 0.0, 1.0);
}
	`,

	avgShader : `

uniform sampler2D noiseBuffer;
uniform sampler2D avgBuffer;

uniform vec2 resolution;
uniform int frame;


#define GX texture2D(noiseBuffer, uv + i * step)
#define GY texture2D(avgBuffer, uv + i * step)

#define STDEV 6.5
#define RADIUS 12.0

#define GAMMA vec4(2.2)

float gaussian(float x) {
    return exp(-x*x/(STDEV*STDEV));
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    vec2 ix = vec2(1.0 / resolution.x, 0.0);
    vec2 iy = vec2(0.0, 1.0 / resolution.y);
    
    bool xpass = mod(float(frame), 2.0) < 1.0;
    vec2 step = xpass ? ix : iy;
    
    vec4 sum = vec4(0.0);
    vec4 denom = vec4(0.0);
    
    #define ZERO vec4(0.0)
    
    for (float i = -RADIUS; i <= RADIUS; i += 1.0) {
        float g = gaussian(i);
        sum += g * pow(xpass ? GX : GY, GAMMA);
        denom += g;
    }

    sum /= denom;
    
    gl_FragColor = pow(sum, 1.0 / GAMMA);
}
	`,
    mainShader : `

uniform sampler2D noiseBuffer;
uniform sampler2D maxBuffer;
uniform sampler2D minBuffer;
uniform sampler2D avgBuffer;
uniform vec2 resolution;

#define STDEV 0.2   // max gaussian width

vec4 gaussian(vec4 x, vec4 m, float s) {
    return exp(-(x-m)*(x-m)/(s*s));
}

vec4 sigmoid(vec4 x, float k) {
    return 1.0 / (1.0 + exp(-k*(x-0.5)));    
}

void main()
{
    vec2 uv = gl_FragCoord.xy / resolution.xy;
    
    vec4 smax = texture2D(maxBuffer, uv);
    vec4 smin = texture2D(minBuffer, uv);
    vec4 savg = texture2D(avgBuffer, uv);
    vec4 nois = texture2D(noiseBuffer, uv);
    
    // the gaussian width is animated in sync with the noise amount. 
    // generally a larger width is better for noisier data
    
    float t = 1.;
    float s = STDEV * (t + 1.3);
    
    vec4 gmax = gaussian(smax, nois, s);
    vec4 gmin = gaussian(smin, nois, s);
    vec4 gavg = gaussian(savg, nois, s);
    vec4 gsum = gmax + gmin + gavg;
    gmax /= gsum;
    gmin /= gsum;
    gavg /= gsum;
    vec4 gres = gmax * smax + gmin * smin + gavg * savg;
    
    
    #define STR 10.0
    vec4 fmin = sigmoid((savg - smin)/(smax - smin), STR);
    vec4 fmax = sigmoid((smax - savg)/(smax - smin), STR);
    vec4 sres = 0.5 * (mix(smin, smax, fmin) + mix(smax, smin, fmax));
    
    vec4 res = gres;//mix(gres, savg, 2.0 * (smax - smin));

    gl_FragColor = res;
}
    `,
debugFragmentShader : `
varying vec2 vUv;

uniform sampler2D buffer;

void main(){
    gl_FragColor = texture2D(buffer , vUv);
}
`,
};
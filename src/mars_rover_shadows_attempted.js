import {defs, tiny} from './examples/common.js';

import {Color_Phong_Shader, Shadow_Textured_Phong_Shader,
    Depth_Texture_Shader_2D, Buffered_Texture, LIGHT_DEPTH_TEX_SIZE} from './shadow-shaders.js'

// Pull these names into this module's scope for convenience:
const {Vector, Vector3, vec3, vec4, vec, color, hex_color, Matrix, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;
const {Cube, Axis_Arrows, Textured_Phong, Phong_Shader, Basic_Shader, Subdivision_Sphere} = defs

export class Shape_From_File extends Shape {                                   // **Shape_From_File** is a versatile standalone Shape that imports
                                                                               // all its arrays' data from an .obj 3D model file.
    constructor(filename) {
        super("position", "normal", "texture_coord");
        // Begin downloading the mesh. Once that completes, return
        // control to our parse_into_mesh function.
        this.load_file(filename);
    }

    load_file(filename) {                             // Request the external file and wait for it to load.
        // Failure mode:  Loads an empty shape.
        return fetch(filename)
            .then(response => {
                if (response.ok) return Promise.resolve(response.text())
                else return Promise.reject(response.status)
            })
            .then(obj_file_contents => this.parse_into_mesh(obj_file_contents))
            .catch(error => {
                this.copy_onto_graphics_card(this.gl);
            })
    }

    parse_into_mesh(data) {                           // Adapted from the "webgl-obj-loader.js" library found online:
        var verts = [], vertNormals = [], textures = [], unpacked = {};

        unpacked.verts = [];
        unpacked.norms = [];
        unpacked.textures = [];
        unpacked.hashindices = {};
        unpacked.indices = [];
        unpacked.index = 0;

        var lines = data.split('\n');

        var VERTEX_RE = /^v\s/;
        var NORMAL_RE = /^vn\s/;
        var TEXTURE_RE = /^vt\s/;
        var FACE_RE = /^f\s/;
        var WHITESPACE_RE = /\s+/;

        for (var i = 0; i < lines.length; i++) {
            var line = lines[i].trim();
            var elements = line.split(WHITESPACE_RE);
            elements.shift();

            if (VERTEX_RE.test(line)) verts.push.apply(verts, elements);
            else if (NORMAL_RE.test(line)) vertNormals.push.apply(vertNormals, elements);
            else if (TEXTURE_RE.test(line)) textures.push.apply(textures, elements);
            else if (FACE_RE.test(line)) {
                var quad = false;
                for (var j = 0, eleLen = elements.length; j < eleLen; j++) {
                    if (j === 3 && !quad) {
                        j = 2;
                        quad = true;
                    }
                    if (elements[j] in unpacked.hashindices)
                        unpacked.indices.push(unpacked.hashindices[elements[j]]);
                    else {
                        var vertex = elements[j].split('/');

                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 0]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 1]);
                        unpacked.verts.push(+verts[(vertex[0] - 1) * 3 + 2]);

                        if (textures.length) {
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 0]);
                            unpacked.textures.push(+textures[((vertex[1] - 1) || vertex[0]) * 2 + 1]);
                        }

                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 0]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 1]);
                        unpacked.norms.push(+vertNormals[((vertex[2] - 1) || vertex[0]) * 3 + 2]);

                        unpacked.hashindices[elements[j]] = unpacked.index;
                        unpacked.indices.push(unpacked.index);
                        unpacked.index += 1;
                    }
                    if (j === 3 && quad) unpacked.indices.push(unpacked.hashindices[elements[0]]);
                }
            }
        }
        {
            const {verts, norms, textures} = unpacked;
            for (var j = 0; j < verts.length / 3; j++) {
                this.arrays.position.push(vec3(verts[3 * j], verts[3 * j + 1], verts[3 * j + 2]));
                this.arrays.normal.push(vec3(norms[3 * j], norms[3 * j + 1], norms[3 * j + 2]));
                this.arrays.texture_coord.push(vec(textures[2 * j], textures[2 * j + 1]));
            }
            this.indices = unpacked.indices;
        }
        this.normalize_positions(false);
        this.ready = true;
    }

    draw(context, program_state, model_transform, material) {               // draw(): Same as always for shapes, but cancel all
        // attempts to draw the shape before it loads:
        if (this.ready)
            super.draw(context, program_state, model_transform, material);
    }
}

export class Mars_Rover_Shadows_Attempted extends Scene {
    constructor() {
        // constructor(): Scenes begin by populating initial values like the Shapes and Materials they'll need.
        super();

        // setup class configurable parameters
        this.DEBUG = false; // enable debugging features (i.e. ambient light high for visibility)
        this.SUN_PERIOD = 10;
        this.SUN_MORNING_POS = 5*Math.PI/4;
        this.SUN_DAY_POS = 3*Math.PI/2;
        this.SUN_NIGHT_POS = Math.PI/2;

        // At the beginning of our program, load one of each of these shape definitions onto the GPU.
        this.shapes = {

            // environment objects
            sphere3: new defs.Subdivision_Sphere(3),
            crystal: new Shape_From_File("assets/crystal.obj"),

            // terrain
            square: new defs.Square(),
            terrain: new Shape_From_File("assets/mars_terrain_flat3.obj"),

            // rover pieces
            rover: new Shape_From_File("assets/rover.obj"),
            rover_body: new Shape_From_File("assets/rover_body.obj"),
            rover_solar_panels: new Shape_From_File("assets/rover_solar_panels.obj"),
            rover_wheel_left: new Shape_From_File("assets/rover_wheel_left.obj"),
            rover_wheel_right: new Shape_From_File("assets/rover_wheel_right.obj")
        };

        // *** Materials
        this.materials = {
            sun: new Material(new Shadow_Textured_Phong_Shader(1),
                {ambient: this.DEBUG ? 1.0 : 1.0, diffusivity: .6, color: hex_color("#ffffff")}),
            rover: new Material(new Shadow_Textured_Phong_Shader(1),
                {ambient: this.DEBUG ? 1.0 : 0.5, diffusivity: 1.0, specularity: 0.5, color: hex_color("ffa436")}),
            mars: new Material(new Shadow_Textured_Phong_Shader(1),
                {ambient: this.DEBUG ? 1.0 : 0.3, diffusivity: 0.6, specularity: 0.3, color: hex_color("ffa436")}),
            crystal: new Material(new Shadow_Textured_Phong_Shader(1),
                {ambient: this.DEBUG ? 1.0 : 0.0, diffusivity: 0.8, specularity: 1.0, color: color(1, 0.43, 0.91, 0.7)})
            // TODO:  Fill in as many additional material objects as needed in this key/value table.
            //        (Requirement 4)
        }

        // ******************************** SHADOWS ******************************** //
        // For the floor or other plain objects
        this.floor = new Material(new Shadow_Textured_Phong_Shader(1), {
            color: color(1, 1, 1, 1),
            ambient: 0.3,
            diffusivity: 0.7,
            specularity: 0.4,
            smoothness: 64,
            color_texture: null,
            light_depth_texture: null
        })
        // For the first pass
        this.pure = new Material(new Color_Phong_Shader(), {
        })
        // For light source
        this.light_src = new Material(new Phong_Shader(), {
            color: color(1, 1, 1, 1), ambient: 1, diffusivity: 0, specularity: 0
        });
        // For depth texture display
        this.depth_tex =  new Material(new Depth_Texture_Shader_2D(), {
            color: color(0, 0, .0, 1),
            ambient: 1, diffusivity: 0, specularity: 0, texture: null
        });

        // To make sure texture initialization only does once
        this.init_ok = false;

        // other
        this.light_color = color(1, 1, 1, 1);
        // ******************************** SHADOWS ******************************** //

        // setup state
        this.camera_pos_global = Mat4.identity().times(Mat4.rotation(Math.PI/4, 1, 0, 0)).times(Mat4.translation(0,-300,-300));
        this.rover_pos = Mat4.identity();
        this.rover_base_lateral_speed_factor = 0.15;
        this.rover_base_spin_speed_factor = 1;
        this.moved_forward = false;
        this.moved_backward = false;
        this.rover_user_lateral_speed_factor = 1;
        this.rover_user_spin_speed_factor = 1;
        this.enable_day_night_cycle = true;
        this.cur_day_night = this.SUN_MORNING_POS;
        this.sun_period = this.SUN_PERIOD;
    }

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button( "Move Left", [ "j" ], this.move_left );
        this.key_triggered_button( "Move Right", [ "l" ], this.move_right );
        this.new_line();
        this.key_triggered_button( "Move Forward", [ "i" ], this.move_forward );
        this.key_triggered_button( "Move Back", [ "k" ], this.move_backward );
        this.new_line();
        this.new_line();

        this.key_triggered_button( "1st Person View", [ "8" ], () => this.cur_camera = () => this.camera_pos_first_person );
        this.key_triggered_button( "3rd Person View", [ "9" ], () => this.cur_camera = () => this.camera_pos_third_person );
        this.key_triggered_button( "Global View", [ "0" ], () => this.cur_camera = () => this.camera_pos_global );
        this.new_line();
        this.new_line();

        this.key_triggered_button( "Toggle Day/Night Cycle", [ "z" ], () => this.enable_day_night_cycle = !(this.enable_day_night_cycle));
        this.key_triggered_button( "Set Morning", [ "x" ], () => this.cur_day_night = this.SUN_MORNING_POS );
        this.key_triggered_button( "Set Day", [ "c" ], () => this.cur_day_night = this.SUN_DAY_POS );
        this.key_triggered_button( "Set Night", [ "v" ], () => this.cur_day_night = this.SUN_NIGHT_POS );
        this.new_line();
        this.new_line();

        const day_night_cycle_controls = this.control_panel.appendChild(document.createElement("span"));
        this.key_triggered_button("-", [ "Control", "n"], () =>
            this.sun_period -= 1.0, undefined, undefined, undefined, day_night_cycle_controls);
        this.key_triggered_button("+", [ "Control", "m" ], () =>
            this.sun_period += 1.0, undefined, undefined, undefined, day_night_cycle_controls);
        this.live_string(box => {
            box.textContent = " Day/Night Period: " + this.sun_period.toFixed(2)
        }, day_night_cycle_controls);
        this.new_line();
        this.new_line();

        const lateral_speed_controls = this.control_panel.appendChild(document.createElement("span"));
        this.key_triggered_button("-", [ "n" ], () =>
            this.rover_user_lateral_speed_factor /= 1.2, undefined, undefined, undefined, lateral_speed_controls);
        this.key_triggered_button("+", [ "m" ], () =>
            this.rover_user_lateral_speed_factor *= 1.2, undefined, undefined, undefined, lateral_speed_controls);
        this.live_string(box => {
            box.textContent = "Lateral Speed: " + this.rover_user_lateral_speed_factor .toFixed(2)
        }, lateral_speed_controls);
        this.new_line();

        const speed_controls = this.control_panel.appendChild(document.createElement("span"));
        this.key_triggered_button("-", [ "Control", "n"], () =>
            this.rover_user_spin_speed_factor /= 1.2, undefined, undefined, undefined, speed_controls);
        this.key_triggered_button("+", [ "Control", "m" ], () =>
            this.rover_user_spin_speed_factor *= 1.2, undefined, undefined, undefined, speed_controls);
        this.live_string(box => {
            box.textContent = " Spin Speed: " + this.rover_user_spin_speed_factor.toFixed(2)
        }, speed_controls);
        this.new_line();
        this.new_line();
    }

    move_left()
    {
        let speed_factor = this.rover_user_spin_speed_factor*this.rover_base_spin_speed_factor;
        this.rover_pos = this.rover_pos.times(Mat4.rotation(speed_factor*1*Math.PI/180, 0, 1, 0));
    }

    move_right()
    {
        let speed_factor = this.rover_user_spin_speed_factor*this.rover_base_spin_speed_factor;
        this.rover_pos = this.rover_pos.times(Mat4.rotation(speed_factor*1*Math.PI/180, 0, -1, 0));
    }

    move_forward()
    {
        let speed_factor = this.rover_user_lateral_speed_factor*this.rover_base_lateral_speed_factor;
        this.rover_pos = this.rover_pos.times(Mat4.translation(0,0,speed_factor*-1));
    }

    move_backward()
    {
        let speed_factor = this.rover_user_lateral_speed_factor*this.rover_base_lateral_speed_factor;
        this.rover_pos = this.rover_pos.times(Mat4.translation(0,0,speed_factor*1));
    }

    // ******************************** SHADOWS ******************************** //
    texture_buffer_init(gl) {
        // Depth Texture
        this.lightDepthTexture = gl.createTexture();
        // Bind it to TinyGraphics
        this.light_depth_texture = new Buffered_Texture(this.lightDepthTexture);
        // REPLACE IF NEED TEXTURE --> this.stars.light_depth_texture = this.light_depth_texture
        this.floor.light_depth_texture = this.light_depth_texture

        this.lightDepthTextureSize = LIGHT_DEPTH_TEX_SIZE;
        gl.bindTexture(gl.TEXTURE_2D, this.lightDepthTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,      // target
            0,                  // mip level
            gl.DEPTH_COMPONENT, // internal format
            this.lightDepthTextureSize,   // width
            this.lightDepthTextureSize,   // height
            0,                  // border
            gl.DEPTH_COMPONENT, // format
            gl.UNSIGNED_INT,    // type
            null);              // data
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Depth Texture Buffer
        this.lightDepthFramebuffer = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightDepthFramebuffer);
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,       // target
            gl.DEPTH_ATTACHMENT,  // attachment point
            gl.TEXTURE_2D,        // texture target
            this.lightDepthTexture,         // texture
            0);                   // mip level
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // create a color texture of the same size as the depth texture
        // see article why this is needed_
        this.unusedTexture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, this.unusedTexture);
        gl.texImage2D(
            gl.TEXTURE_2D,
            0,
            gl.RGBA,
            this.lightDepthTextureSize,
            this.lightDepthTextureSize,
            0,
            gl.RGBA,
            gl.UNSIGNED_BYTE,
            null,
        );
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        // attach it to the framebuffer
        gl.framebufferTexture2D(
            gl.FRAMEBUFFER,        // target
            gl.COLOR_ATTACHMENT0,  // attachment point
            gl.TEXTURE_2D,         // texture target
            this.unusedTexture,         // texture
            0);                    // mip level
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    // ******************************** SHADOWS ******************************** //

    draw_crystals(context, program_state, mt, shadow_pass)
    {
        let mt_crystal = mt.times(Mat4.translation(0, -2.25, 0)).times(Mat4.scale(0.5,0.5,0.5));

        // crystal record
        const CRYSTALS = [[-50, 0, 80], [-55, 0, 80], [-60, 0, 80], [-65, 0, 80], [-70, 0, 80], [-25, 0, -62], [-15, 0, -50], [-252, 0, 0], [-4, 0, -40], [20, 0, -30], [550, 0, -300]];
        const CRYSTAL_COLORS = [color(1, 0.43, 0.91, 0.7), color(1, 0.16, 0.16, 0.7), color(0.27, 0.58, 1, 0.7), color(0.4, 1, 0.87, 0.7), color(0.49, 1, 0.4, 0.7)];

        for (var i = 0; i < CRYSTALS.length; i++)
        {
            let pos = CRYSTALS[i];
            let color = CRYSTAL_COLORS[i % CRYSTAL_COLORS.length];
            let mt_tmp = mt_crystal.times(Mat4.translation(pos[0], pos[1], pos[2]));
            this.shapes.crystal.draw(context, program_state, mt_tmp, shadow_pass ? this.materials.crystal.override({color: color}) : this.pure);
        }

        return mt;
    }

    draw_rover(context, program_state, mt, shadow_pass)
    {
        // configurable parameters
        const SCALE_ROVER_BODY = 1.5;
        const COLOR_ROVER_BODY = hex_color("#fff652"); // yellow
        const COLOR_ROVER_WHEEL = hex_color("#858585"); // gray
        const COLOR_ROVER_SOLAR_PANELS = hex_color("#0015ff"); // darker blue

        // move rover to current (relative) world position
        let mt_rover = mt.times(this.rover_pos);

        // rover pieces
        let mt_rover_body = mt_rover.times(Mat4.scale(SCALE_ROVER_BODY, SCALE_ROVER_BODY, SCALE_ROVER_BODY));
        this.shapes.rover_body.draw(context, program_state, mt_rover_body, shadow_pass ? this.floor.override({ color : COLOR_ROVER_BODY}) : this.pure);

        let mt_rover_solar_panels = mt_rover.times(Mat4.translation(0.3,-0.4,1.1)).times(Mat4.scale(1.5, 1.5, 1.5));
        this.shapes.rover_solar_panels.draw(context, program_state, mt_rover_solar_panels, shadow_pass ? this.floor.override({ color: COLOR_ROVER_SOLAR_PANELS }) : this.pure);
        
        // wheels
        let mt_rover_wheels = mt_rover.times(Mat4.scale(0.25, 0.25, 0.25));

        // left wheels
        const TRANSLATION_LEFT_WHEELS = [[-5, -7.6, 7.3],[-4, -7.6, 1.8],[-4, -7.6, -5.1]];

        for (var i = 0; i < TRANSLATION_LEFT_WHEELS.length; i++)
        {
            let pos = TRANSLATION_LEFT_WHEELS[i];
            let mt_tmp = mt_rover_wheels.times(Mat4.translation(pos[0], pos[1], pos[2]));
            this.shapes.rover_wheel_left.draw(context, program_state, mt_tmp, shadow_pass ? this.floor.override({color: COLOR_ROVER_WHEEL}) : this.pure);
        }

        // right wheels
        const TRANSLATION_RIGHT_WHEELS = [[6.9, -7.6, 7.3],[5.9, -7.6, 1.8],[5.9, -7.6, -5.1]];

        for (var i = 0; i < TRANSLATION_RIGHT_WHEELS.length; i++)
        {
            let pos = TRANSLATION_RIGHT_WHEELS[i];
            let mt_tmp = mt_rover_wheels.times(Mat4.translation(pos[0], pos[1], pos[2]));
            this.shapes.rover_wheel_right.draw(context, program_state, mt_tmp, shadow_pass ? this.floor.override({color: COLOR_ROVER_WHEEL}) : this.pure);
        }

        return mt;
    }

    color_sinusoidal(min_color, max_color, period, start_at_min=true)
    {
        const r = this.sinusoidal(min_color[0], max_color[0], period, start_at_min=start_at_min);
        const g = this.sinusoidal(min_color[1], max_color[1], period, start_at_min=start_at_min);
        const b = this.sinusoidal(min_color[2], max_color[2], period, start_at_min=start_at_min);
        const o = this.sinusoidal(min_color[3], max_color[3], period, start_at_min=start_at_min);

        return color(r, g, b, o);
    }

    sinusoidal(min, max, period, start_at_min=true)
    {
        const frequency = 2*Math.PI/period;
        const offset = (start_at_min ? -1 : 1) * Math.PI/2;          
        return min + (0.5*(max-min) + 0.5*(max-min)*Math.sin(frequency*this.t + offset));
    }

    render_scene(context, program_state, shadow_pass, draw_light_source=false, draw_shadow=false) {
        // shadow_pass: true if this is the second pass that draw the shadow.
        // draw_light_source: true if we want to draw the light source.
        // draw_shadow: true if we want to draw the shadow

        // init buffers
        let mt_rover = Mat4.identity();
        //let mt_sun = Mat4.identity();
        let mt_crystal = Mat4.identity();

        let light_position = this.light_position;
        let light_color = this.light_color;
        const t = program_state.animation_time;

        program_state.draw_shadow = draw_shadow;

        if (draw_light_source && shadow_pass) {
            
            let mt_light = Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.scale(.5,.5,.5));

            this.shapes.sphere3.draw(context, program_state, mt_light, this.light_src.override({color: light_color}));
        }

        // this.floor.override({ ambient: 0.5, color: this.materials.cabin_frame.color })

        // this.shapes.sphere.draw(context, program_state, model_trans_ball_4, shadow_pass? this.floor : this.pure);

        // // lights
        // // let sun_frequency = 2*Math.PI/this.sun_period;
        // // let angular_pos = this.enable_day_night_cycle ? this.t*sun_frequency : this.cur_day_night;
        // // mt_sun = mt_sun.times(Mat4.rotation(angular_pos, 0, 0, 1)).times(Mat4.translation(-1000,0,0)).times(Mat4.scale(50,50,50));
        // // this.shapes.sphere3.draw(context, program_state, mt_sun, this.materials.sun);

        // const sun_light_pos = mt_sun.times(vec4(1, 1, 1, 1));
        // const amb_light_pos = vec4(0, 100, 0, 1);

        // program_state.lights.push(new Light(sun_light_pos, color(1, 1, 1, 1), 10**14)); // parameters of the Light are: position, color, size
        // program_state.lights.push(new Light(amb_light_pos, color(1, 1, 1, 1), 10**5));

        // draw rovers
        this.draw_rover(context, program_state, mt_rover, shadow_pass);

        // draw ground
        this.shapes.terrain.draw(context, program_state, Mat4.translation(0, 18, 0).times(Mat4.scale(300, 300, 300)), shadow_pass ? this.floor.override({ color: this.materials.mars.color}) : this.pure);

        // draw crystals
        this.draw_crystals(context, program_state, mt_crystal, shadow_pass);

        // update camera attachment
        if (this.cur_camera != undefined)
        {
            let desired = this.cur_camera();
            program_state.camera_inverse = desired.map((x,i) => Vector.from(program_state.camera_inverse[i]).mix(x,0.3));
        }
    }

    display(context, program_state) {
        // display():  Called once per frame of animation.

        // update camera positions
        this.camera_pos_first_person = Mat4.inverse(this.rover_pos.times(Mat4.translation(0,2,-1.5)));//Mat4.look_at(vec3(0, 10, 20), vec3(0, 5, 0), vec3(0, 1, 0));
        this.camera_pos_third_person = Mat4.inverse(this.rover_pos.times(Mat4.translation(0,5,16.5)).times(Mat4.rotation(-Math.PI/32, 1, 0, 0)));

        // setup -- This part sets up the scene's overall camera matrix, projection matrix, and lights:
        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(this.camera_pos_global);
        }

        // update object members
        const t = this.t = program_state.animation_time / 1000; // current animation time
        const dt = program_state.animation_delta_time / 1000; // current animation delta time

        const gl = context.context;

        if (!this.init_ok) {
            const ext = gl.getExtension('WEBGL_depth_texture');
            if (!ext) {
                return alert('need WEBGL_depth_texture');  // eslint-disable-line
            }
            this.texture_buffer_init(gl);

            this.init_ok = true;
        }

        // lights
        let mt_sun = Mat4.identity();
        let sun_frequency = 2*Math.PI/this.sun_period;
        let angular_pos = this.enable_day_night_cycle ? this.t*sun_frequency : this.cur_day_night;
        mt_sun = mt_sun.times(Mat4.rotation(angular_pos, 0, 0, 1)).times(Mat4.translation(-1000,0,0)).times(Mat4.scale(50,50,50));
        //this.shapes.sphere3.draw(context, program_state, mt_sun, this.materials.sun);

        const sun_light_pos = mt_sun.times(vec4(1, 1, 1, 1));
        const amb_light_pos = vec4(0, 100, 0, 1);

        this.light_position = sun_light_pos;

        program_state.lights = new Array();
        program_state.lights.push(new Light(sun_light_pos, this.light_color, 10**14)); // parameters of the Light are: position, color, size
        //program_state.lights.push(new Light(amb_light_pos, color(1, 1, 1, 1), 10**5));

        // This is a rough target of the light.
        // Although the light is point light, we need a target to set the POV of the light
        this.light_view_target = vec4(0, 0, 0, 1);
        this.light_field_of_view = 130 * Math.PI / 180; // 130 degree

        //program_state.lights = [new Light(this.light_position, this.light_color, 1000)];

        // Step 1: set the perspective and camera to the POV of light
        const light_view_mat = Mat4.look_at(
            vec3(this.light_position[0], this.light_position[1], this.light_position[2]),
            vec3(this.light_view_target[0], this.light_view_target[1], this.light_view_target[2]),
            vec3(0, 1, 0), // assume the light to target will have a up dir of +y, maybe need to change according to your case
        );
        const light_proj_mat = Mat4.perspective(this.light_field_of_view, 1, 0.5, 500);
        // Bind the Depth Texture Buffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightDepthFramebuffer);
        gl.viewport(0, 0, this.lightDepthTextureSize, this.lightDepthTextureSize);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        // Prepare uniforms
        program_state.light_view_mat = light_view_mat;
        program_state.light_proj_mat = light_proj_mat;
        program_state.light_tex_mat = light_proj_mat;
        program_state.view_mat = light_view_mat;
        program_state.projection_transform = light_proj_mat;
        this.render_scene(context, program_state, false,false, false);

        // Step 2: unbind, draw to the canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        program_state.view_mat = program_state.camera_inverse;
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);
        this.render_scene(context, program_state, true,true, true);
    }
}

class Gouraud_Shader extends Shader {
    // This is a Shader using Phong_Shader as template
    // TODO: Modify the glsl coder here to create a Gouraud Shader (Planet 2)

    constructor(num_lights = 2) {
        super();
        this.num_lights = num_lights;
    }

    shared_glsl_code() {
        // ********* SHARED CODE, INCLUDED IN BOTH SHADERS *********
        return ` 
        precision mediump float;
        const int N_LIGHTS = ` + this.num_lights + `;
        uniform float ambient, diffusivity, specularity, smoothness;
        uniform vec4 light_positions_or_vectors[N_LIGHTS], light_colors[N_LIGHTS];
        uniform float light_attenuation_factors[N_LIGHTS];
        uniform vec4 shape_color;
        uniform vec3 squared_scale, camera_center;
        // Specifier "varying" means a variable's final value will be passed from the vertex shader
        // on to the next phase (fragment shader), then interpolated per-fragment, weighted by the
        // pixel fragment's proximity to each of the 3 vertices (barycentric interpolation).
        varying vec3 N, vertex_worldspace;
        // ***** PHONG SHADING HAPPENS HERE: *****                                       
        vec3 phong_model_lights( vec3 N, vec3 vertex_worldspace ){                                        
            // phong_model_lights():  Add up the lights' contributions.
            vec3 E = normalize( camera_center - vertex_worldspace );
            vec3 result = vec3( 0.0 );
            for(int i = 0; i < N_LIGHTS; i++){
                // Lights store homogeneous coords - either a position or vector.  If w is 0, the 
                // light will appear directional (uniform direction from all points), and we 
                // simply obtain a vector towards the light by directly using the stored value.
                // Otherwise if w is 1 it will appear as a point light -- compute the vector to 
                // the point light's location from the current surface point.  In either case, 
                // fade (attenuate) the light as the vector needed to reach it gets longer.  
                vec3 surface_to_light_vector = light_positions_or_vectors[i].xyz - 
                                               light_positions_or_vectors[i].w * vertex_worldspace;                                             
                float distance_to_light = length( surface_to_light_vector );
                vec3 L = normalize( surface_to_light_vector );
                vec3 H = normalize( L + E );
                // Compute the diffuse and specular components from the Phong
                // Reflection Model, using Blinn's "halfway vector" method:
                float diffuse  =      max( dot( N, L ), 0.0 );
                float specular = pow( max( dot( N, H ), 0.0 ), smoothness );
                float attenuation = 1.0 / (1.0 + light_attenuation_factors[i] * distance_to_light * distance_to_light );
                
                vec3 light_contribution = shape_color.xyz * light_colors[i].xyz * diffusivity * diffuse
                                                          + light_colors[i].xyz * specularity * specular;
                result += attenuation * light_contribution;
            }
            return result;
        } `;
    }

    vertex_glsl_code() {
        // ********* VERTEX SHADER *********
        return this.shared_glsl_code() + `
            attribute vec3 position, normal;                            
            // Position is expressed in object coordinates.
            
            uniform mat4 model_transform;
            uniform mat4 projection_camera_model_transform;
    
            void main(){                                                                   
                // The vertex's final resting place (in NDCS):
                gl_Position = projection_camera_model_transform * vec4( position, 1.0 );
                // The final normal vector in screen space.
                N = normalize( mat3( model_transform ) * normal / squared_scale);
                vertex_worldspace = ( model_transform * vec4( position, 1.0 ) ).xyz;
                gl_Position.xyz += phong_model_lights( normalize( N ), vertex_worldspace);
            } `;
    }

    fragment_glsl_code() {
        // ********* FRAGMENT SHADER *********
        // A fragment is a pixel that's overlapped by the current triangle.
        // Fragments affect the final image or get discarded due to depth.
        return this.shared_glsl_code() + `
            void main(){                                                           
                // Compute an initial (ambient) color:
                gl_FragColor = vec4( shape_color.xyz * ambient, shape_color.w );
                // Compute the final color with contributions from lights:
                gl_FragColor.xyz += phong_model_lights( normalize( N ), vertex_worldspace );
            } `;
    }

    send_material(gl, gpu, material) {
        // send_material(): Send the desired shape-wide material qualities to the
        // graphics card, where they will tweak the Phong lighting formula.
        gl.uniform4fv(gpu.shape_color, material.color);
        gl.uniform1f(gpu.ambient, material.ambient);
        gl.uniform1f(gpu.diffusivity, material.diffusivity);
        gl.uniform1f(gpu.specularity, material.specularity);
        gl.uniform1f(gpu.smoothness, material.smoothness);
    }

    send_gpu_state(gl, gpu, gpu_state, model_transform) {
        // send_gpu_state():  Send the state of our whole drawing context to the GPU.
        const O = vec4(0, 0, 0, 1), camera_center = gpu_state.camera_transform.times(O).to3();
        gl.uniform3fv(gpu.camera_center, camera_center);
        // Use the squared scale trick from "Eric's blog" instead of inverse transpose matrix:
        const squared_scale = model_transform.reduce(
            (acc, r) => {
                return acc.plus(vec4(...r).times_pairwise(r))
            }, vec4(0, 0, 0, 0)).to3();
        gl.uniform3fv(gpu.squared_scale, squared_scale);
        // Send the current matrices to the shader.  Go ahead and pre-compute
        // the products we'll need of the of the three special matrices and just
        // cache and send those.  They will be the same throughout this draw
        // call, and thus across each instance of the vertex shader.
        // Transpose them since the GPU expects matrices as column-major arrays.
        const PCM = gpu_state.projection_transform.times(gpu_state.camera_inverse).times(model_transform);
        gl.uniformMatrix4fv(gpu.model_transform, false, Matrix.flatten_2D_to_1D(model_transform.transposed()));
        gl.uniformMatrix4fv(gpu.projection_camera_model_transform, false, Matrix.flatten_2D_to_1D(PCM.transposed()));

        // Omitting lights will show only the material color, scaled by the ambient term:
        if (!gpu_state.lights.length)
            return;

        const light_positions_flattened = [], light_colors_flattened = [];
        for (let i = 0; i < 4 * gpu_state.lights.length; i++) {
            light_positions_flattened.push(gpu_state.lights[Math.floor(i / 4)].position[i % 4]);
            light_colors_flattened.push(gpu_state.lights[Math.floor(i / 4)].color[i % 4]);
        }
        gl.uniform4fv(gpu.light_positions_or_vectors, light_positions_flattened);
        gl.uniform4fv(gpu.light_colors, light_colors_flattened);
        gl.uniform1fv(gpu.light_attenuation_factors, gpu_state.lights.map(l => l.attenuation));
    }

    update_GPU(context, gpu_addresses, gpu_state, model_transform, material) {
        // update_GPU(): Define how to synchronize our JavaScript's variables to the GPU's.  This is where the shader
        // recieves ALL of its inputs.  Every value the GPU wants is divided into two categories:  Values that belong
        // to individual objects being drawn (which we call "Material") and values belonging to the whole scene or
        // program (which we call the "Program_State").  Send both a material and a program state to the shaders
        // within this function, one data field at a time, to fully initialize the shader for a draw.

        // Fill in any missing fields in the Material object with custom defaults for this shader:
        const defaults = { color: color(0, 0, 0, 1), ambient: 0, diffusivity: 1, specularity: 1, smoothness: 40 };
        material = Object.assign({}, defaults, material);

        this.send_material(context, gpu_addresses, material);
        this.send_gpu_state(context, gpu_addresses, gpu_state, model_transform);
    }
}
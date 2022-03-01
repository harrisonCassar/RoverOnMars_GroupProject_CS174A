import {defs, tiny} from './examples/common.js';
// Pull these names into this module's scope for convenience:
const {Vector, Vector3, vec3, vec4, vec, color, hex_color, Matrix, Mat4, Light, Shape, Material, Shader, Texture, Scene} = tiny;
const {Cube, Axis_Arrows, Textured_Phong, Phong_Shader, Basic_Shader, Subdivision_Sphere} = defs


import {Shape_From_File} from './examples/obj-file-demo.js'
import {Color_Phong_Shader, Shadow_Textured_Phong_Shader,
    Depth_Texture_Shader_2D, Buffered_Texture, LIGHT_DEPTH_TEX_SIZE} from './shadow-shaders.js'

// 2D shape, to display the texture buffer
const Square =
    class Square extends tiny.Vertex_Buffer {
        constructor() {
            super("position", "normal", "texture_coord");
            this.arrays.position = [
                vec3(0, 0, 0), vec3(1, 0, 0), vec3(0, 1, 0),
                vec3(1, 1, 0), vec3(1, 0, 0), vec3(0, 1, 0)
            ];
            this.arrays.normal = [
                vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1),
                vec3(0, 0, 1), vec3(0, 0, 1), vec3(0, 0, 1),
            ];
            this.arrays.texture_coord = [
                vec(0, 0), vec(1, 0), vec(0, 1),
                vec(1, 1), vec(1, 0), vec(0, 1)
            ]
        }
    }

// The scene
export class Mars_Rover_Shadow extends Scene {
    constructor() {
        super();

        // setup class configurable parameters
        this.DEBUG = false; // enable debugging features (i.e. ambient light high for visibility)
        this.SUN_PERIOD = 5;
        this.SUN_MORNING_POS = 5*Math.PI/4;
        this.SUN_DAY_POS = 3*Math.PI/2;
        this.SUN_NIGHT_POS = Math.PI/2;
        
        // Load the model file:
        this.shapes = {
            "teapot": new Shape_From_File("assets/teapot.obj"),
            "sphere": new Subdivision_Sphere(6),
            "cube": new Cube(),
            "square_2d": new Square(),

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

        // // *** Materials
        // this.materials = {
        //     sun: new Material(new defs.Phong_Shader(),
        //         {ambient: this.DEBUG ? 1.0 : 1.0, diffusivity: .6, color: hex_color("#ffffff")}),
        //     rover: new Material(new defs.Phong_Shader(),
        //         {ambient: this.DEBUG ? 1.0 : 0.5, diffusivity: 1.0, specularity: 0.5, color: hex_color("ffa436")}),
        //     mars: new Material(new defs.Phong_Shader(),
        //         {ambient: this.DEBUG ? 1.0 : 0.3, diffusivity: 0.6, specularity: 0.3, color: hex_color("ffa436")}),
        //     crystal: new Material(new defs.Phong_Shader(),
        //         {ambient: this.DEBUG ? 1.0 : 0.0, diffusivity: 0.8, specularity: 1.0, color: color(1, 0.43, 0.91, 0.7)})
        // }

        // ************************ SHADOWS ***************************
        // For the floor or other plain objects
        this.floor = new Material(new Shadow_Textured_Phong_Shader(1), {
            color: color(1, 1, 1, 1), ambient: .3, diffusivity: 0.6, specularity: 0.4, smoothness: 64,
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
        // ************************ SHADOWS ***************************

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
        // // make_control_panel(): Sets up a panel of interactive HTML elements, including
        // // buttons with key bindings for affecting this scene, and live info readouts.
        // this.control_panel.innerHTML += "Dragonfly rotation angle: ";
        // // The next line adds a live text readout of a data member of our Scene.
        // this.live_string(box => {
        //     box.textContent = (this.hover ? 0 : (this.t % (2 * Math.PI)).toFixed(2)) + " radians"
        // });
        // this.new_line();
        // this.new_line();
        // // Add buttons so the user can actively toggle data members of our Scene:
        // this.key_triggered_button("Hover dragonfly in place", ["h"], function () {
        //     this.hover ^= 1;
        // });
        // this.new_line();
        // this.key_triggered_button("Swarm mode", ["m"], function () {
        //     this.swarm ^= 1;
        // });
    }

    texture_buffer_init(gl) {
        // Depth Texture
        this.lightDepthTexture = gl.createTexture();
        // Bind it to TinyGraphics
        this.light_depth_texture = new Buffered_Texture(this.lightDepthTexture);
        // FOR TEXTURE, USE THIS --> this.stars.light_depth_texture = this.light_depth_texture
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

    draw_crystals(context, program_state, mt, shadow_pass)
    {
        let mt_crystal = mt.times(Mat4.translation(0, -2.25, 0)).times(Mat4.scale(0.5,0.5,0.5));

        // crystal record
        const CRYSTALS = [[5,0,10], [-50, 0, 80], [-55, 0, 80], [-60, 0, 80], [-65, 0, 80], [-70, 0, 80], [-25, 0, -62], [-15, 0, -50], [-252, 0, 0], [-4, 0, -40], [20, 0, -30], [550, 0, -300]];
        const CRYSTAL_COLORS = [color(1, 0.43, 0.91, 0.7), color(1, 0.16, 0.16, 0.7), color(0.27, 0.58, 1, 0.7), color(0.4, 1, 0.87, 0.7), color(0.49, 1, 0.4, 0.7)];

        for (var i = 0; i < CRYSTALS.length; i++)
        {
            let pos = CRYSTALS[i];
            let color = CRYSTAL_COLORS[i % CRYSTAL_COLORS.length];
            let mt_tmp = mt_crystal.times(Mat4.translation(pos[0], pos[1], pos[2]));
            this.shapes.crystal.draw(context, program_state, mt_tmp, shadow_pass ? this.floor.override({color: color}) : this.pure);
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
        this.shapes.rover_body.draw(context, program_state, mt_rover_body, shadow_pass ? this.floor.override({color:COLOR_ROVER_BODY}) : this.pure);

        let mt_rover_solar_panels = mt_rover.times(Mat4.translation(0.3,-0.4,1.1)).times(Mat4.scale(1.5, 1.5, 1.5));
        this.shapes.rover_solar_panels.draw(context, program_state, mt_rover_solar_panels, shadow_pass ? this.floor.override({color:COLOR_ROVER_SOLAR_PANELS}) : this.pure);
        
        // wheels
        let mt_rover_wheels = mt_rover.times(Mat4.scale(0.25, 0.25, 0.25));

        // left wheels
        const TRANSLATION_LEFT_WHEELS = [[-5, -7.6, 7.3],[-4, -7.6, 1.8],[-4, -7.6, -5.1]];

        for (var i = 0; i < TRANSLATION_LEFT_WHEELS.length; i++)
        {
            let pos = TRANSLATION_LEFT_WHEELS[i];
            let mt_tmp = mt_rover_wheels.times(Mat4.translation(pos[0], pos[1], pos[2]));
            this.shapes.rover_wheel_left.draw(context, program_state, mt_tmp, shadow_pass ? this.floor.override({color:COLOR_ROVER_WHEEL}): this.pure);
        }

        // right wheels
        const TRANSLATION_RIGHT_WHEELS = [[6.9, -7.6, 7.3],[5.9, -7.6, 1.8],[5.9, -7.6, -5.1]];

        for (var i = 0; i < TRANSLATION_RIGHT_WHEELS.length; i++)
        {
            let pos = TRANSLATION_RIGHT_WHEELS[i];
            let mt_tmp = mt_rover_wheels.times(Mat4.translation(pos[0], pos[1], pos[2]));
            this.shapes.rover_wheel_right.draw(context, program_state, mt_tmp, shadow_pass ? this.floor.override({color:COLOR_ROVER_WHEEL}): this.pure);
        }

        return mt;
    }

    render_scene(context, program_state, shadow_pass, draw_light_source=false, draw_shadow=false) {
        // shadow_pass: true if this is the second pass that draw the shadow.
        // draw_light_source: true if we want to draw the light source.
        // draw_shadow: true if we want to draw the shadow

        // init mt buffers
        let mt_rover = Mat4.identity();
        let mt_sun = Mat4.identity();
        let mt_crystal = Mat4.identity();

        // access relevant light properties
        let light_position = this.light_position;
        let light_color = this.light_color;

        program_state.draw_shadow = draw_shadow;

        if (draw_light_source && shadow_pass) {
            this.shapes.sphere.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.scale(.5,.5,.5)),
                this.light_src.override({color: light_color}));
        }

        // draw rovers
        this.draw_rover(context, program_state, mt_rover, shadow_pass);

        // draw ground
        this.shapes.terrain.draw(context, program_state, Mat4.translation(0, 18, 0).times(Mat4.scale(300, 300, 300)), shadow_pass ? this.floor.override({color: hex_color("ffa436")}) : this.pure);

        // draw crystals
        this.draw_crystals(context, program_state, mt_crystal, shadow_pass);
    }

    display(context, program_state) {
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

        if (!context.scratchpad.controls) {
            this.children.push(context.scratchpad.controls = new defs.Movement_Controls());
            // Define the global camera and projection matrices, which are stored in program_state.
            program_state.set_camera(Mat4.look_at(
                vec3(0, 12, 12),
                vec3(0, 2, 0),
                vec3(0, 1, 0)
            )); // Locate the camera here
        }

        // The position of the light
        // lights
        let sun_frequency = 2*Math.PI/this.sun_period;
        let angular_pos = this.enable_day_night_cycle ? t*sun_frequency : this.cur_day_night;
        let mt_sun = Mat4.identity().times(Mat4.rotation(angular_pos, 0, 0, 1)).times(Mat4.translation(-10,0,0)).times(Mat4.scale(50,50,50));
        //this.shapes.sphere3.draw(context, program_state, mt_sun, this.materials.sun);

        const sun_light_pos = mt_sun.times(vec4(1, 1, 1, 1));
        const amb_light_pos = vec4(0, 100, 0, 1);

        this.light_position = sun_light_pos; //Mat4.rotation(t / 1.5, 0, 1, 0).times(vec4(3, 6, 0, 1));
        // The color of the light
        this.light_color = color(1,1,1,1);

        // This is a rough target of the light.
        // Although the light is point light, we need a target to set the POV of the light
        this.light_view_target = vec4(0, 0, 0, 1);
        this.light_field_of_view = 130 * Math.PI / 180; // 130 degree

        program_state.lights = [new Light(this.light_position, this.light_color, 10**25)];

        // Step 1: set the perspective and camera to the POV of light
        const light_view_mat = Mat4.look_at(
            vec3(this.light_position[0], this.light_position[1], this.light_position[2]),
            vec3(this.light_view_target[0], this.light_view_target[1], this.light_view_target[2]),
            vec3(0, 1, 0), // assume the light to target will have a up dir of +y, maybe need to change according to your case
        );
        const light_proj_mat = Mat4.perspective(this.light_field_of_view, 1, 0.5, 1000);
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
        this.render_scene(context, program_state, false, false, false);

        // Step 2: unbind, draw to the canvas
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
        program_state.view_mat = program_state.camera_inverse;
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 500);
        this.render_scene(context, program_state, true, true, true);

        // Step 3: display the textures
        this.shapes.square_2d.draw(context, program_state,
            Mat4.translation(-.99, .08, 0).times(
            Mat4.scale(0.5, 0.5 * gl.canvas.width / gl.canvas.height, 1)
            ),
            this.depth_tex.override({texture: this.lightDepthTexture})
        );
    }

    // show_explanation(document_element) {
    //     document_element.innerHTML += "<p>This demo loads an external 3D model file of a teapot.  It uses a condensed version of the \"webgl-obj-loader.js\" "
    //         + "open source library, though this version is not guaranteed to be complete and may not handle some .OBJ files.  It is contained in the class \"Shape_From_File\". "
    //         + "</p><p>One of these teapots is lit with bump mapping.  Can you tell which one?</p>";
    // }
}


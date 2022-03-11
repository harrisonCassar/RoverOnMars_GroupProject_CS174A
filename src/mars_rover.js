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
export class Mars_Rover extends Scene {
    constructor() {
        super();

        // setup class configurable parameters
        this.DEBUG = false; // enable debugging features (i.e. ambient light high for visibility)
        this.SUN_PERIOD = 5;
        this.SUN_MORNING_POS = 5*Math.PI/4;
        this.SUN_DAY_POS = 3*Math.PI/2;
        this.SUN_NIGHT_POS = Math.PI/2;
        this.COLLISION_HITBOX_WIDTH = 2.5;
        this.COLLISION_MAGIC_WORKY = 0.5;
        this.WALL_BOUNDING_BOXES = [[[-4.7, -27.6], [55, -85]], [[452, -470], [276, 443]], [[276, 443], [-548, 327]], [[-388, 325], [-538, -530]], [[-367, -389], [489, -462]], [[84, -295.5], [-120, -388.7]], [[-231, 326], [-314, 213]], [[-89, 213], [-165, 115]], [[-154, -165], [-225, 7]], [[-220, 116], [-251, 186]]]; // TEST RECT (mars base): [[25, 129], [66, 171]]

        // setup state parameters
        this.COLOR_ROVER_BODY_IDX = 0;
        this.COLOR_ROVER_WHEEL_IDX = 1;
        this.COLOR_ROVER_SOLAR_PANELS_IDX = 2;
        this.COLOR_ROVER_RADIO_IDX = 3;
        this.CAMERA_NULL = 0;
        this.CAMERA_FIRST = 1;
        this.CAMERA_THIRD = 2;
        this.CAMERA_THIRD_SKY = 3;
        this.CAMERA_GLOBAL = 4;
        this.CRYSTAL_MAX_NUM = 28;

        // Load the model file:
        this.shapes = {
            "teapot": new Shape_From_File("assets/teapot.obj"),
            "sphere": new Subdivision_Sphere(6),
            "cube": new Cube(),
            "square_2d": new Square(),

            // environment objects
            sphere3: new defs.Subdivision_Sphere(3),
            crystal: new Shape_From_File("assets/crystal.obj"),
            crystal_broken: new Shape_From_File("assets/crystal_broken.obj"),

            // mars base pieces
            base_middle: new Shape_From_File("assets/base_middle.obj"),
            base: new Shape_From_File("assets/base.obj"),

            // terrain
            square: new defs.Square(),
            terrain: new Shape_From_File("assets/mars_terrain_flat3.obj"),

            // rover pieces
            rover: new Shape_From_File("assets/rover.obj"),
            rover_body: new Shape_From_File("assets/rover_body.obj"),
            rover_solar_panels: new Shape_From_File("assets/rover_solar_panels.obj"),
            rover_wheel_left: new Shape_From_File("assets/rover_wheel_left.obj"),
            rover_wheel_right: new Shape_From_File("assets/rover_wheel_right.obj"),
            
            // radio
            rover_radio: new Shape_From_File("assets/rover_radio.obj")
        };

        // ************************ SHADOWS ***************************
        // For the floor or other plain objects
        this.materials = {
            sky: new Material(new Textured_Phong(), {
                color: hex_color("#000000"),
                ambient: 1.0, diffusivity: 0.1, specularity: 0.1,
                texture: new Texture("assets/night_sky.jpg", "NEAREST")
            }),
            floor: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: color(1, 1, 1, 1), ambient: .3, diffusivity: 0.6, specularity: 0.9, smoothness: 64,
                color_texture: null,
                light_depth_texture: null
            }),
            rover: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("ffa436"),
                ambient: 0.5,
                diffusivity: 0.6,
                specularity: 0.9,
                smoothness: 64,
                color_texture: null,
                light_depth_texture: null
            }),
            mars: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: hex_color("ffa436"),
                ambient: 0.3,
                diffusivity: 0.6,
                specularity: 0.3,
                smoothness: 64,
                color_texture: new Texture("assets/soil.png", "NEAREST"),
                light_depth_texture: null
            }),
            crystal: new Material(new Shadow_Textured_Phong_Shader(1), {
                color: color(1, 0.43, 0.91, 0.7),
                ambient: 0.3,
                diffusivity: 0.8,
                specularity: 1.0,
                smoothness: 64,
                color_texture: null,
                light_depth_texture: null
            })
        }

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

        // ************************ STATE SETUP ***************************
        // camera
        this.camera_pos_first_person = Mat4.identity();
        this.camera_pos_third_person = Mat4.identity();
        this.camera_pos_sky_third_person = Mat4.identity();
        this.camera_pos_global = Mat4.identity().times(Mat4.rotation(Math.PI/4, 1, 0, 0)).times(Mat4.translation(25,-500,-600));
        this.cur_camera = () => this.camera_pos_third_person;
        this.f_cur_camera = this.CAMERA_THIRD;

        // rover pos and movement
        this.rover_pos = Mat4.identity();
        this.rover_pos_x = 0;
        this.rover_pos_z = 0;
        this.rover_look_angle = 0;
        this.rover_base_lateral_speed_factor = 0.15;
        this.rover_base_spin_speed_factor = 1;
        this.rover_user_lateral_speed_factor = 1;
        this.rover_user_spin_speed_factor = 1;
        this.f_move_left = false;
        this.f_move_right = false;
        this.f_move_forward = false;
        this.f_move_backward = false;

        // day/night
        this.enable_day_night_cycle = true;
        this.cur_day_night = this.SUN_MORNING_POS;
        this.sun_period = this.SUN_PERIOD;

        // mouse picking
        this.canvas;
        this.music = new Audio();
        this.activated = false;
        this.hasListener = false;
        this.init_mouse_picking_bounds();

        // rover coloring
        this.init_rover_colors();

        // crystals
        this.CRYSTAL_LOCATIONS = [[484, 0, 236], [110, 0, 688], [-394, 0, 236], [-252, 0, 0], [190, 0, -260], [271, 0, -732], [502, 0, -730], [40, 0, -530], [-402, 0, -722], [-768, 0, -228], [-640, 0, 646], [-25, 0, -62], [-15, 0, -50], [-252, 0, 0], [-4, 0, -40], [20, 0, -30], [-712, 0, 636], [-758, 0, 560], [-466, 0, 18], [302, 0, 342], [550, 0, -300], [-424, 0, 636], [634, 0, -696], [520, 0, -466], [-50, 0, -422], [-482, 0, -340], [580, 0, -265], [-410, 0, 243]]; //[0,0,10], [-50, 0, 80], [-55, 0, 80], [-60, 0, 80], [-65, 0, 80], [-70, 0, 80], [-25, 0, -62], [-15, 0, -50], [-252, 0, 0], [-4, 0, -40], [20, 0, -30], [550, 0, -300], [0,2,0], [0,4,0], [0,6,0], [0,8,0], [0,10,0], [0,12,0], [0,14,0], [0,16,0]]; // [0,0,15], [0,0,20], [0,0,25], [0,0,-10], [0,0,30], [5,0,50], [0,14,0], [0,16,0]]; // 
        this.CRYSTAL_COLORS = [color(1, 0.43, 0.91, 0.7), color(1, 0.16, 0.16, 0.7), color(0.27, 0.58, 1, 0.7), color(0.4, 1, 0.87, 0.7), color(0.49, 1, 0.4, 0.7)];
        this.spawn_crystals();

        // lofi
        this.lofi_paused_time = 0;
        this.f_lofi_playing = false;

        // debugging
        this.last_pos = vec4(0,0,0,1);
        this.last_print = 0;

        // ************************ STATE SETUP ***************************
    }
    
    get_random_color() {
        return color(Math.random(), Math.random(), Math.random(), 1.0)
    }
    
    randomize_rover_colors() {
        for (let i = 0; i < 4; i++)
            this.rover_body_colors[i] = this.get_random_color();
    }

    spawn_crystals() {
        this.CRYSTAL_LIVE = new Array(this.CRYSTAL_MAX_NUM).fill(true);
    }

    init_rover_colors() {
        const COLOR_ROVER_BODY = hex_color("#fff652"); // yellow
        const COLOR_ROVER_WHEEL = hex_color("#858585"); // gray
        const COLOR_ROVER_SOLAR_PANELS = hex_color("#0015ff"); // darker blue
        const COLOR_ROVER_RADIO = hex_color("#858585"); // gray

        this.rover_body_colors = [COLOR_ROVER_BODY, COLOR_ROVER_WHEEL, COLOR_ROVER_SOLAR_PANELS, COLOR_ROVER_RADIO];
    }

    init_mouse_picking_bounds() {
        this.left_bound = Infinity;
        this.right_bound = -Infinity;
        this.top_bound = -Infinity;
        this.bottom_bound = Infinity;
    }

    make_control_panel() {
        // Draw the scene's buttons, setup their actions and keyboard shortcuts, and monitor live measurements.
        this.key_triggered_button( "Move Left", [ "j" ], () => this.f_move_left = true, '#6E6460', () => this.f_move_left = false);
        this.key_triggered_button( "Move Right", [ "l" ], () => this.f_move_right = true, '#6E6460', () => this.f_move_right = false);
        this.key_triggered_button( "Move Forward", [ "i" ], () => this.f_move_forward = true, '#6E6460', () => this.f_move_forward = false);
        this.key_triggered_button( "Move Back", [ "k" ], () => this.f_move_backward = true, '#6E6460', () => this.f_move_backward = false);
        this.new_line();
        this.new_line();

        this.key_triggered_button( "1st Person View", [ "7" ], () => { this.cur_camera = () => this.camera_pos_first_person; this.f_cur_camera = this.CAMERA_FIRST} );
        this.key_triggered_button( "3rd Person View", [ "8" ], () => { this.cur_camera = () => this.camera_pos_third_person; this.f_cur_camera = this.CAMERA_THIRD} );
        this.key_triggered_button( "Sky 3rd Person View", [ "9" ], () => { this.cur_camera = () => this.camera_pos_sky_third_person; this.f_cur_camera = this.CAMERA_THIRD_SKY} );
        this.key_triggered_button( "Global View", [ "0" ], () => { this.cur_camera = () => this.camera_pos_global; this.f_cur_camera = this.CAMERA_GLOBAL} );
        this.new_line();
        this.new_line();

        this.key_triggered_button("Change Rover Colors", ["e"], this.randomize_rover_colors);
        this.key_triggered_button("Set Original Rover Colors", ["r"], this.init_rover_colors);
        this.key_triggered_button("Respawn Crystals", [ "Control", "u"], this.spawn_crystals);
        this.new_line();
        this.new_line();

        this.key_triggered_button( "Toggle Day/Night Cycle", [ "z" ], () => this.enable_day_night_cycle = !(this.enable_day_night_cycle));
        this.key_triggered_button( "Set Morning", [ "x" ], () => this.cur_day_night = this.SUN_MORNING_POS );
        this.key_triggered_button( "Set Day", [ "c" ], () => this.cur_day_night = this.SUN_DAY_POS );
        this.key_triggered_button( "Set Night", [ "v" ], () => this.cur_day_night = this.SUN_NIGHT_POS );
        this.new_line();
        this.new_line();

        const day_night_cycle_controls = this.control_panel.appendChild(document.createElement("span"));
        this.key_triggered_button("-", [ "Control", "z"], () =>
            this.sun_period -= 1.0, undefined, undefined, undefined, day_night_cycle_controls);
        this.key_triggered_button("+", [ "Control", "x" ], () =>
            this.sun_period += 1.0, undefined, undefined, undefined, day_night_cycle_controls);
        this.live_string(box => {
            box.textContent = " Day/Night Period: " + this.sun_period.toFixed(2)
        }, day_night_cycle_controls);
        this.new_line();
        this.new_line();

        const lateral_speed_controls = this.control_panel.appendChild(document.createElement("span"));
        this.key_triggered_button("-", [ "Control", "v" ], () =>
            this.rover_user_lateral_speed_factor /= 1.2, undefined, undefined, undefined, lateral_speed_controls);
        this.key_triggered_button("+", [ "Control", "b" ], () =>
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
        
        const overall_speed_controls = this.control_panel.appendChild(document.createElement("span"));
        this.key_triggered_button( "Set Fast Movement", [ "Control", "c" ], () => 
            { this.rover_user_lateral_speed_factor = 6.19; this.rover_user_spin_speed_factor = 2.99;}, undefined, undefined, undefined, overall_speed_controls);
        this.key_triggered_button( "Set Default Movement", [ "Control", "d" ], () => 
            { this.rover_user_lateral_speed_factor = 1.00; this.rover_user_spin_speed_factor = 1.00;}, undefined, undefined, undefined, overall_speed_controls);
        this.new_line();
        this.new_line();
    }

    move_left()
    {
        let speed_factor = this.rover_user_spin_speed_factor*this.rover_base_spin_speed_factor;

        let dtheta = speed_factor*1*Math.PI/180;

        this.rover_look_angle += dtheta;
        
        // for shading
        this.rover_pos = this.rover_pos.times(Mat4.rotation(speed_factor*1*Math.PI/180, 0, 1, 0));
    }

    move_right()
    {
        let speed_factor = this.rover_user_spin_speed_factor*this.rover_base_spin_speed_factor;

        let dtheta = speed_factor*-1*Math.PI/180;

        this.rover_look_angle += dtheta;
        
        // for shading
        this.rover_pos = this.rover_pos.times(Mat4.rotation(speed_factor*1*Math.PI/180, 0, -1, 0));
    }

    move_forward()
    {
        let speed_factor = this.rover_user_lateral_speed_factor*this.rover_base_lateral_speed_factor;

        let dx = speed_factor*-1*Math.sin(this.rover_look_angle);
        let dz = speed_factor*-1*Math.cos(this.rover_look_angle);

        if (!(this.check_wall_collision(dx, dz))) {
            this.rover_pos_x += dx;
            this.rover_pos_z += dz;
            
            // for shading
            this.rover_pos = this.rover_pos.times(Mat4.translation(0,0,speed_factor*-1));
        }
        
        
    }

    move_backward()
    {
        let speed_factor = this.rover_user_lateral_speed_factor*this.rover_base_lateral_speed_factor;

        let dx = speed_factor*1*Math.sin(this.rover_look_angle);
        let dz = speed_factor*1*Math.cos(this.rover_look_angle);

        if (!(this.check_wall_collision(dx, dz))) {
            this.rover_pos_x += dx;
            this.rover_pos_z += dz;
            
            // for shading
            this.rover_pos = this.rover_pos.times(Mat4.translation(0,0,speed_factor*1));
        }
    }

    check_wall_collision(dx, dz)
    {
        let new_rover_pos_x = this.rover_pos_x + dx;
        let new_rover_pos_z = this.rover_pos_z + dz;

        // check each wall
        for (let i = 0; i < this.WALL_BOUNDING_BOXES.length; i++)
        {
            let wall_pos = this.WALL_BOUNDING_BOXES[i];
            let max_bounds = this.get_max_bounds(wall_pos[0], wall_pos[1]);
            //console.log(max_bounds);
            let min_bounds = this.get_min_bounds(wall_pos[0], wall_pos[1]);
            //console.log(min_bounds);

            //console.log("New Rover Pos: " + String(new_rover_pos_x) + ", " + String(new_rover_pos_z));

            // check if colliding
            if ((new_rover_pos_x <= max_bounds[0]) &&
                (new_rover_pos_x >= min_bounds[0]) &&
                (new_rover_pos_z <= max_bounds[1]) &&
                (new_rover_pos_z >= min_bounds[1]))
            {
                console.log("COLLISION!!");
                return true;
            }
        }

        // no collisions detected (valid move!)
        return false;
    }

    get_max_bounds(p1, p2)
    {
        return [Math.max(p1[0], p2[0]), Math.max(p1[1], p2[1])];
    }

    get_min_bounds(p1, p2)
    {
        return [Math.min(p1[0], p2[0]), Math.min(p1[1], p2[1])];
    }

    texture_buffer_init(gl) {
        // Depth Texture
        this.lightDepthTexture = gl.createTexture();
        // Bind it to TinyGraphics
        this.light_depth_texture = new Buffered_Texture(this.lightDepthTexture);
        // FOR TEXTURE, USE THIS --> this.stars.light_depth_texture = this.light_depth_texture
        this.materials.mars.light_depth_texture = this.light_depth_texture
        this.materials.floor.light_depth_texture = this.light_depth_texture;
        this.materials.rover.light_depth_texture = this.light_depth_texture;
        this.materials.mars.light_depth_texture = this.light_depth_texture;
        this.materials.crystal.light_depth_texture = this.light_depth_texture;

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

    draw_mars_base(context, program_state, mt, shadow_pass)
    {   
        let mt_base = mt.times(Mat4.translation(45, 0, 150));
        let mt_base_full = mt_base.times(Mat4.translation(0, -5, 0)).times(Mat4.scale(20,20,20));
        this.shapes.base.draw(context, program_state, mt_base_full, shadow_pass ? this.materials.floor : this.pure);
        
        let mt_base_middle = mt_base.times(Mat4.translation(0, -1.85, 0)).times(Mat4.scale(13.5, 13.5, 13.5));
        this.shapes.base_middle.draw(context, program_state, mt_base_middle, shadow_pass ? this.materials.floor.override({color: hex_color("fff305")}) : this.pure);
    }

    draw_crystals(context, program_state, mt, shadow_pass)
    {
        let mt_crystal = mt.times(Mat4.translation(0, -2.25, 0));

        for (var i = 0; i < this.CRYSTAL_MAX_NUM; i++)
        {
            let pos = this.CRYSTAL_LOCATIONS[i];
            let color = this.CRYSTAL_COLORS[i % this.CRYSTAL_COLORS.length];
            let height_scale = this.CRYSTAL_LIVE[i] ? 0.5 : 1.75;
            let mt_tmp = mt_crystal.times(Mat4.scale(0.5,height_scale,0.5)).times(Mat4.translation(pos[0], pos[1], pos[2]));

            let shape = this.CRYSTAL_LIVE[i] ? this.shapes.crystal : this.shapes.crystal_broken;

            shape.draw(context, program_state, mt_tmp, shadow_pass ? this.materials.crystal.override({color: color}) : this.pure);
        }

        return mt;
    }

    draw_rover(context, program_state, mt, shadow_pass)
    {
        // configurable parameters
        const SCALE_ROVER_BODY = 1.5;

        // move rover to current (relative) world position
        let mt_rover = mt.times(Mat4.translation(this.rover_pos_x, 0, this.rover_pos_z)).times(Mat4.rotation(this.rover_look_angle, 0, 1, 0));

        // rover pieces
        let mt_rover_body = mt_rover.times(Mat4.scale(SCALE_ROVER_BODY, SCALE_ROVER_BODY, SCALE_ROVER_BODY));
        this.shapes.rover_body.draw(context, program_state, mt_rover_body, shadow_pass ? this.materials.rover.override({color:this.rover_body_colors[this.COLOR_ROVER_BODY_IDX]}) : this.pure);

        let mt_rover_solar_panels = mt_rover.times(Mat4.translation(0.3,-0.4,1.1)).times(Mat4.scale(1.5, 1.5, 1.5));
        this.shapes.rover_solar_panels.draw(context, program_state, mt_rover_solar_panels, shadow_pass ? this.materials.rover.override({color:this.rover_body_colors[this.COLOR_ROVER_SOLAR_PANELS_IDX]}) : this.pure);
        
        // wheels
        let mt_rover_wheels = mt_rover.times(Mat4.scale(0.25, 0.25, 0.25));

        // left wheels
        const TRANSLATION_LEFT_WHEELS = [[-5, -7.6, 7.3],[-4, -7.6, 1.8],[-4, -7.6, -5.1]];

        for (var i = 0; i < TRANSLATION_LEFT_WHEELS.length; i++)
        {
            let pos = TRANSLATION_LEFT_WHEELS[i];
            let mt_tmp = mt_rover_wheels.times(Mat4.translation(pos[0], pos[1], pos[2]));
            
            // perform extra steering transformation on front wheel (for coolness!)
            if (i == TRANSLATION_LEFT_WHEELS.length-1) {
                let k = this.f_move_left ? 1 : (this.f_move_right ? -1 : 0);
                mt_tmp = mt_tmp.times(Mat4.rotation(k*Math.PI/4, 0, 1, 0));
            }

            // perform extra rotation transformation if moving
            if (this.f_move_forward) {
                mt_tmp = mt_tmp.times(Mat4.rotation(-this.t, 1, 0, 0));
            }
            else if (this.f_move_backward) {
                mt_tmp = mt_tmp.times(Mat4.rotation(this.t, 1, 0, 0));
            }

            this.shapes.rover_wheel_left.draw(context, program_state, mt_tmp, shadow_pass ? this.materials.rover.override({color:this.rover_body_colors[this.COLOR_ROVER_WHEEL_IDX]}): this.pure);
        }

        // right wheels
        const TRANSLATION_RIGHT_WHEELS = [[6.9, -7.6, 7.3],[5.9, -7.6, 1.8],[5.9, -7.6, -5.1]];

        for (var i = 0; i < TRANSLATION_RIGHT_WHEELS.length; i++)
        {
            let pos = TRANSLATION_RIGHT_WHEELS[i];
            let mt_tmp = mt_rover_wheels.times(Mat4.translation(pos[0], pos[1], pos[2]));
            
            // perform extra steering transformation on front wheel (for coolness!)
            if (i == TRANSLATION_RIGHT_WHEELS.length-1) {
                let k = this.f_move_left ? 1 : (this.f_move_right ? -1 : 0);
                mt_tmp = mt_tmp.times(Mat4.rotation(k*Math.PI/4, 0, 1, 0));
            }

            // perform extra rotation transformation if moving
            if (this.f_move_forward) {
                mt_tmp = mt_tmp.times(Mat4.rotation(-this.t, 1, 0, 0));
            }
            else if (this.f_move_backward) {
                mt_tmp = mt_tmp.times(Mat4.rotation(this.t, 1, 0, 0));
            }

            this.shapes.rover_wheel_right.draw(context, program_state, mt_tmp, shadow_pass ? this.materials.rover.override({color:this.rover_body_colors[this.COLOR_ROVER_WHEEL_IDX]}): this.pure);
        }

        // radio
        let mt_rover_radio = mt_rover.times(Mat4.translation(0.95,0.3,0.8)).times(Mat4.rotation(9*Math.PI/12, 0, 1, 0)).times(Mat4.scale(0.5, 0.5, 0.5));
        this.shapes.rover_radio.draw(context, program_state, mt_rover_radio, shadow_pass ? this.materials.rover.override({color:this.rover_body_colors[this.COLOR_ROVER_RADIO_IDX]}) : this.pure);
        
        let radio_fill = mt_rover.times(Mat4.translation(0.77,-0.1,0.702)).times(Mat4.rotation(9*Math.PI/12, 0, 1, 0)).times(Mat4.scale(0.535, 0.5, 0.125));
        this.shapes.cube.draw(context, program_state, radio_fill, shadow_pass ? this.materials.rover.override({color:this.rover_body_colors[this.COLOR_ROVER_RADIO_IDX]}) : this.pure);

        return mt;
    }

    render_scene(context, program_state, shadow_pass, draw_light_source=false, draw_shadow=false) {
        // shadow_pass: true if this is the second pass that draw the shadow.
        // draw_light_source: true if we want to draw the light source.
        // draw_shadow: true if we want to draw the shadow

        // update camera positions
        let mt_cam = Mat4.identity().times(Mat4.translation(this.rover_pos_x, 0, this.rover_pos_z)).times(Mat4.rotation(this.rover_look_angle,0,1,0));
        this.camera_pos_first_person = Mat4.inverse(mt_cam.times(Mat4.translation(0,2,-1.5)));//Mat4.look_at(vec3(0, 10, 20), vec3(0, 5, 0), vec3(0, 1, 0));
        this.camera_pos_third_person = Mat4.inverse(mt_cam.times(Mat4.translation(0,5,16.5)).times(Mat4.rotation(-Math.PI/32, 1, 0, 0)));
        this.camera_pos_sky_third_person = Mat4.inverse(mt_cam.times(Mat4.translation(-3,0,12)).times(Mat4.rotation(1.5*Math.PI/32, 1, 0, 0)));

        // init mt buffers
        let mt_rover = Mat4.identity();
        let mt_crystal = Mat4.identity();
        let mt_mars_base = Mat4.identity();

        // access relevant light properties
        let light_position = this.sun_light_pos;
        let light_color = this.light_color;

        program_state.draw_shadow = draw_shadow;

        // draw light source
        if (draw_light_source && shadow_pass) {
            // sphere representing Sun (this is NOT the location of the true light source used for shadows, as we're "faking" them with a closer light source)
            this.shapes.sphere.draw(context, program_state,
                Mat4.translation(light_position[0], light_position[1], light_position[2]).times(Mat4.scale(100,100,100)),
                this.light_src.override({color: light_color}));
            
            if (this.DEBUG)
            {
                this.shapes.sphere.draw(context, program_state,
                    Mat4.translation(this.light_position[0], this.light_position[1], this.light_position[2]).times(Mat4.scale(.5,.5,.5)),
                    this.light_src.override({color: light_color}));
            }
        }

        // draw rovers
        this.draw_rover(context, program_state, mt_rover, shadow_pass);

        // draw ground
        this.shapes.terrain.draw(context, program_state, Mat4.translation(0, 18, 0).times(Mat4.scale(300, 300, 300)), shadow_pass ? this.materials.mars.override({color: hex_color("ffa436")}) : this.pure);

        // draw crystals
        this.draw_crystals(context, program_state, mt_crystal, shadow_pass);

        // draw sky
        this.shapes.sphere3.draw(context, program_state, Mat4.scale(1000, 1000, 1000), this.materials.sky);

        // draw mars base
        this.draw_mars_base(context, program_state, mt_mars_base, shadow_pass);

        // provide support for mouse picking
        this.canvas = context.canvas;

        if (this.f_cur_camera == this.CAMERA_THIRD) {
            this.left_bound = 0;
            this.right_bound = 0.15;
            this.top_bound = -0.35;
            this.bottom_bound = -0.65;
        }
        else if (this.f_cur_camera == this.CAMERA_THIRD_SKY) {
            this.left_bound = 0.375;
            this.right_bound = 0.53;
            this.top_bound = -0.225;
            this.bottom_bound = -0.475;
        }
        else {
            this.init_mouse_picking_bounds();
        }

        const mouse_position = (e, rect = this.canvas.getBoundingClientRect()) =>
            vec((e.clientX - (rect.left + rect.right) / 2) / ((rect.right - rect.left) / 2),
                (e.clientY - (rect.bottom + rect.top) / 2) / ((rect.top - rect.bottom) / 2));
        
        if (!this.hasListener) {
            this.hasListener = true;
            this.canvas.addEventListener("click", e => {
                e.preventDefault();
                let pos = mouse_position(e);
                //console.log(pos);
                let pos_x = pos[0];
                let pos_y = pos[1];
                let inside_x = ((pos_x >= this.left_bound) && (pos_x <= this.right_bound));
                let inside_y = ((pos_y >= this.bottom_bound) && (pos_y <= this.top_bound));
                if (inside_x && inside_y) {
                    if (!this.activated) {
                        this.activated = true;
                        //console.log("Playing music!");
                        this.play_music();
                    }
                    else {
                        this.activated = false;
                        //console.log("Pausing music!");
                        this.pause_music();
                    }
                }
            });
        }

        // update camera attachment
        if (this.cur_camera != undefined)
        {
            let desired = this.cur_camera();
            program_state.camera_inverse = desired.map((x,i) => Vector.from(program_state.camera_inverse[i]).mix(x,0.3));
        }
    }

    play_music() {

        // load and play lofi
        this.music.src = "assets/lofi_mix.mp3";
        this.music.volume = 0.3;
        this.music.play();
        this.music.currentTime = this.lofi_paused_time;

        // set playing flag
        this.f_lofi_playing = true;
    }

    pause_music() {

        // save time
        this.lofi_paused_time = this.music.currentTime;

        // pause music
        this.music.pause();

        // unset playing flag
        this.f_lofi_playing = false;
    }

    play_pop() {

        // play pop
        this.music.src = "assets/crystal_pickup.mp3";
        this.music.volume = 0.5;
        this.music.play();
    }

    check_rover_crystal_collisions() {
        
        // check each crystals
        for (let i = 0; i < this.CRYSTAL_MAX_NUM; i++)
        {
            // only process if alive
            if (this.CRYSTAL_LIVE[i])
            {
                let crystal_pos = this.CRYSTAL_LOCATIONS[i];

                // check if colliding
                if ((crystal_pos[0]*this.COLLISION_MAGIC_WORKY <= this.rover_pos_x + this.COLLISION_HITBOX_WIDTH) &&
                    (crystal_pos[0]*this.COLLISION_MAGIC_WORKY >= this.rover_pos_x - this.COLLISION_HITBOX_WIDTH) &&
                    (crystal_pos[2]*this.COLLISION_MAGIC_WORKY <= this.rover_pos_z + this.COLLISION_HITBOX_WIDTH) &&
                    (crystal_pos[2]*this.COLLISION_MAGIC_WORKY >= this.rover_pos_z - this.COLLISION_HITBOX_WIDTH))
                {
                    // collect crystal
                    this.CRYSTAL_LIVE[i] = false;

                    // play "pop" item pickup sound (if lofi is not playing)
                    if (!this.f_lofi_playing)
                        this.play_pop();

                    console.log("CRYSTAL COLLECTED: " + String(i) + " at: " + String(crystal_pos[0]) + ", " + String(crystal_pos[2]));
                }
            }
        }
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

        if (t - this.last_print > 1) {
            console.log("Current Rover Pos: " + String(this.rover_pos_x) + ", " + String(0) + ", " + String(this.rover_pos_z));
            this.last_print = t;
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

        // update rover position as per necessary
        if (this.f_move_left) {
            if (this.f_move_backward) // reverse controls when moving backward (if needed)
                this.move_right();
            else
                this.move_left();
        }
        if (this.f_move_right) {
            if (this.f_move_backward) // reverse controls when moving backward (if needed)
                this.move_left();
            else
                this.move_right();
        }
        if (this.f_move_forward){
            this.move_forward();
        }
        if (this.f_move_backward){
            this.move_backward();
        }

        // check for crystal collisions
        this.check_rover_crystal_collisions();

        // lights and light properties (for use by shading)
        let rover_cur_pos = vec4(this.rover_pos_x, 0, this.rover_pos_z, 1); // need to spawn lights relative to rover (for our "faking" shading purposes)
        let sun_frequency = 2*Math.PI/this.sun_period;
        let angular_pos = this.enable_day_night_cycle ? t*sun_frequency : this.cur_day_night;
        let mt_sun_pre_translate = Mat4.identity().times(Mat4.translation(rover_cur_pos[0],rover_cur_pos[1],rover_cur_pos[2])).times(Mat4.rotation(angular_pos, 0, 0, 1));
        this.sun_light_pos = mt_sun_pre_translate.times(Mat4.translation(-1000,0,0)).times(vec4(0, 0, 0, 1));
        // const amb_light_pos = vec4(0, 100, 0, 1); // REMOVED, as shading seems to cause complications with more than 1 light source :(

        this.light_color = color(1,1,1,1);
        this.light_position = mt_sun_pre_translate.times(Mat4.translation(-5,0,0)).times(vec4(0, 0, 0, 1)); //Mat4.rotation(t / 1.5, 0, 1, 0).times(vec4(3, 15, 0, 1));
        //let RELATIVE_LIGHT_LOOKAT_DIST = 10;
        //this.light_view_target = vec4(-RELATIVE_LIGHT_LOOKAT_DIST*Math.sin(this.rover_look_angle) + rover_cur_pos[0], 0, -RELATIVE_LIGHT_LOOKAT_DIST*Math.cos(this.rover_look_angle) + rover_cur_pos[2], 1);//Mat4.translation(0, -12.5, -10).times(Mat4.translation(rover_cur_pos[0], rover_cur_pos[1], rover_cur_pos[2])).times(Mat4.rotation(this.rover_look_angle, 0, 1, 0)).times(vec4(0,0,0,1)); // This is a rough target of the light. Although the light is point light, we need a target to set the POV of the light
        this.light_view_target = this.rover_pos.times(vec4(0, -12.5, -10, 1)); // This is a rough target of the light. Although the light is point light, we need a target to set the POV of the light
        this.light_field_of_view = 130 * Math.PI / 180; // 130 degree

        program_state.lights = [new Light(this.sun_light_pos, this.light_color, 10**25), new Light(this.light_position, this.light_color, 10**25)];

        /****************** SHADING STEPS ******************/
        // Step 1: set the perspective and camera to the POV of light
        const light_view_mat = Mat4.look_at(
            vec3(this.light_position[0], this.light_position[1], this.light_position[2]),
            vec3(this.light_view_target[0], this.light_view_target[1], this.light_view_target[2]),
            vec3(0, -1, 0), // assume the light to target will have a up dir of +y, maybe need to change according to your case
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
        program_state.projection_transform = Mat4.perspective(Math.PI / 4, context.width / context.height, 0.5, 2000);
        this.render_scene(context, program_state, true, true, true);

        // Step 3: display the textures
        if (this.DEBUG)
        {
            this.shapes.square_2d.draw(context, program_state,
                Mat4.translation(-.99, .08, 0).times(
                Mat4.scale(0.5, 0.5 * gl.canvas.width / gl.canvas.height, 1)
                ),
                this.depth_tex.override({texture: this.lightDepthTexture})
            );
        }
        /****************** SHADING STEPS ******************/
    }
}


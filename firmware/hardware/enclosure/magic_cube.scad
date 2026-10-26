// =====================================================================
//  Magic Cube — estructura imprimible (FDM)
//
//  Piezas (elegir con -D part="..." o cambiando `part` abajo):
//    "tile"          cara con rejilla 7×7                         ×5
//    "tile_service"  cara con USB-C, interruptor y zona táctil    ×1
//    "diffuser"      difusor (PLA/PETG blanco o natural)          ×6
//    "post_base"     poste de esquina inferior (inserto M3)       ×4
//    "post_magnet"   poste de esquina superior (imán)             ×4
//    "plate"         placa para la electrónica                    ×1
//    "assembly"      vista del cubo armado (no imprimir)
//    "exploded"      vista explotada (no imprimir)
//
//  Coordenadas de una cara: cara interior en z = 0 (sobre la cama),
//  cara exterior en z = T. Las tiras corren a lo largo de X.
// =====================================================================

part = "assembly";

/* [Cubo] */
L         = 154;        // lado exterior del cubo (mm)

/* [LEDs] */
N         = 7;          // LEDs por lado
pitch     = 1000 / 60;  // separación entre LEDs: tira de 60 LEDs/m
strip_w   = 12;         // ancho de la tira (10 o 12 mm)
strip_gap = 3;          // altura del paso de la tira bajo los tabiques

/* [Cara] */
back_t    = 2;          // placa trasera
cell_h    = 10;         // altura de la rejilla = distancia LED → difusor
diff_t    = 1.2;        // espesor del difusor
wall      = 1.2;        // espesor de los tabiques
gutter_w  = 4;          // canaleta lateral para puentes entre filas
fit       = 0.2;        // holgura de encastre

/* [Servicio] */
usb_x     = -32;        // posición de cada elemento a lo largo del borde
switch_x  = 0;
touch_x   = 32;

/* [Interior] */
post_s    = 12;         // sección de los postes de esquina
post_base_h   = 24;     // altura de los postes inferiores (espacio para batería)
post_magnet_h = 14;
insert_d  = 4.2;        // agujero para inserto roscado M3 (2.6 si es tornillo autorroscante)
insert_h  = 6;
magnet_d  = 8;          // imán de neodimio 8×3
magnet_h  = 3;
plate_t   = 3;

$fn = 48;
eps = 0.01;

// ---------- Derivados ----------
T           = back_t + cell_h + diff_t;  // espesor de cada cara
grid_half   = N * pitch / 2;             // mitad de la zona de LEDs
grid_out    = grid_half + wall / 2;      // borde exterior de la rejilla
recess_half = grid_out + gutter_w;       // mitad del difusor
cav         = L / 2 - T;                 // mitad del hueco interior
post_c      = cav - post_s / 2;          // centro de los postes

function row_y(r) = (r - (N - 1) / 2) * pitch;
function wall_pos(i) = (i - N / 2) * pitch;

assert(cav - (grid_out + gutter_w) > 0.8, "L demasiado chico para la rejilla");

// =====================================================================
//  Cara
// =====================================================================
module frustum() {
  hull() {
    linear_extrude(eps) square(2 * cav, center = true);
    translate([0, 0, T - eps]) linear_extrude(eps) square(L, center = true);
  }
}

module cells() {
  c = pitch - wall;
  for (i = [0 : N - 1], j = [0 : N - 1])
    translate([wall_pos(i) + pitch / 2, wall_pos(j) + pitch / 2, back_t + cell_h / 2 + eps])
      cube([c, c, cell_h + 2 * eps], center = true);
}

// Paso de la tira por debajo de los tabiques perpendiculares a ella.
module strip_passes() {
  for (r = [0 : N - 1])
    translate([0, row_y(r), back_t + strip_gap / 2 - eps])
      cube([2 * (grid_out + gutter_w), strip_w + 1, strip_gap + eps], center = true);
}

// Canaletas a izquierda y derecha: puentes entre filas (zigzag) y cables.
// Quedan tapadas por el difusor.
module gutters() {
  for (s = [-1, 1])
    translate([s * (grid_out + gutter_w / 2), 0, back_t + (T - back_t) / 2])
      cube([gutter_w, 2 * grid_out, T - back_t + eps], center = true);
}

// Ranuras desde las canaletas hacia el interior del cubo
// (entrada/salida de datos e inyección de 5 V / GND).
module wire_slots() {
  for (sx = [-1, 1], sy = [-1, 1])
    translate([sx * (grid_out + gutter_w / 2), sy * 25, back_t / 2])
      cube([gutter_w - 1.6, 8, back_t + 2 * eps], center = true);
}

module diffuser_recess() {
  translate([0, 0, T - diff_t + (diff_t + eps) / 2])
    cube([2 * recess_half, 2 * recess_half, diff_t + eps], center = true);
}

module tile() {
  difference() {
    frustum();
    cells();
    strip_passes();
    gutters();
    wire_slots();
    diffuser_recess();
  }
}

// =====================================================================
//  Cara de servicio: todo en el borde negro del lado -Y
//  (al montarla, ese borde va abajo).
// =====================================================================
svc_y = -(recess_half + 3.6);  // centro de la franja del borde

// Canal para cables desde un punto del borde hasta el interior.
module wire_channel(x, y_from, z_from, r = 1.4) {
  hull() {
    translate([x, y_from, z_from]) sphere(r);
    translate([x, -(cav - 2.5), -1]) cylinder(r = r, h = 1);
  }
}

module usb_c_cut() {
  // Conector USB-C hembra suelto (2 o 4 pines con cables), se pega con epoxi.
  w = 9.2; h = 3.6; d = 7.8;
  translate([usb_x, svc_y, T - d])
    hull() for (s = [-1, 1])
      translate([s * (w - h) / 2, 0, 0]) cylinder(d = h, h = d + eps);
  wire_channel(usb_x, svc_y, T - d + 1);
}

module switch_cut() {
  // Interruptor deslizante SS12D00 (8,6 × 3,5 × 4 mm + palanca).
  w = 9.0; h = 4.0; d = 7.5;
  translate([switch_x, svc_y, T - d / 2])
    cube([w, h, d + eps], center = true);
  wire_channel(switch_x, svc_y, T - d + 1);
}

module touch_cut() {
  // Módulo TTP223 (15 × 11 mm) detrás de 1 mm de plástico.
  // El bolsillo sale por el bisel: se inserta antes de pegar la cara inferior.
  w = 15.4; h = 11.4; t = 3.2; skin = 1.0;
  y_in = -(recess_half + 1.3);
  translate([touch_x - w / 2, -(L / 2 + 1), T - skin - t])
    cube([w, (L / 2 + 1) + y_in, t]);
  wire_channel(touch_x, y_in - h / 2, T - skin - t + 1);
}

module touch_mark() {
  translate([touch_x, -(recess_half + 1.3 + 5.7), T - 0.4])
    difference() {
      cylinder(r = 5, h = 0.4 + eps);
      translate([0, 0, -eps]) cylinder(r = 4.2, h = 0.5);
    }
}

module tile_service() {
  difference() {
    tile();
    usb_c_cut();
    switch_cut();
    touch_cut();
    touch_mark();
  }
}

// =====================================================================
//  Difusor
// =====================================================================
module diffuser() {
  linear_extrude(diff_t)
    square(2 * recess_half - 2 * fit, center = true);
}

// =====================================================================
//  Interior
// =====================================================================
module post_base() {
  difference() {
    cube([post_s, post_s, post_base_h]);
    translate([post_s / 2, post_s / 2, post_base_h - insert_h])
      cylinder(d = insert_d, h = insert_h + eps);
  }
}

module post_magnet() {
  difference() {
    cube([post_s, post_s, post_magnet_h]);
    translate([post_s / 2, post_s / 2, post_magnet_h - magnet_h])
      cylinder(d = magnet_d + fit, h = magnet_h + eps);
  }
}

// Placa universal: agujeros cada 10 mm para atornillar o pasar precintos.
// Deja 5 mm libres junto a las paredes para que suban los cables.
module plate() {
  half = cav - 5;
  difference() {
    linear_extrude(plate_t)
      union() {
        square(2 * half, center = true);
        for (sx = [-1, 1], sy = [-1, 1])
          translate([sx * post_c, sy * post_c])
            square(post_s - 2 * fit, center = true);
      }
    for (sx = [-1, 1], sy = [-1, 1])
      translate([sx * post_c, sy * post_c, -eps]) cylinder(d = 3.4, h = plate_t + 2 * eps);
    for (x = [-50 : 10 : 50], y = [-50 : 10 : 50])
      translate([x, y, -eps]) cylinder(d = 3.2, h = plate_t + 2 * eps, $fn = 16);
  }
}

// =====================================================================
//  Vistas
// =====================================================================
// Orienta una cara: local +Z → normal exterior.
module place(face, gap = 0) {
  rot = face == "top"    ? [0, 0, 0]   :
        face == "bottom" ? [180, 0, 0] :
        face == "+x"     ? [0, 90, 0]  :
        face == "-x"     ? [0, -90, 0] :
        face == "+y"     ? [-90, 0, 0] :
                           [90, 0, 0];   // "-y": local -Y queda hacia abajo
  rotate(rot) translate([0, 0, cav + gap]) children();
}

module colored_tile(service = false) {
  color("#222") if (service) tile_service(); else tile();
  color("white", 0.55) translate([0, 0, T - diff_t]) diffuser();
}

module interior(gap = 0) {
  for (sx = [-1, 1], sy = [-1, 1]) {
    color("#e8a33d")
      translate([sx * post_c - post_s / 2, sy * post_c - post_s / 2, -cav]) post_base();
    color("#e8a33d")
      translate([sx * post_c - post_s / 2, sy * post_c - post_s / 2, cav - post_magnet_h + gap * 0.5])
        post_magnet();
  }
  color("#3d7be8") translate([0, 0, -cav + post_base_h + gap * 0.3]) plate();
}

module cube_view(gap = 0) {
  for (f = ["top", "bottom", "+x", "-x", "+y"]) place(f, gap) colored_tile();
  place("-y", gap) colored_tile(service = true);
  interior(gap);
}

if (part == "tile")         tile();
if (part == "tile_service") tile_service();
if (part == "diffuser")     diffuser();
if (part == "post_base")    post_base();
if (part == "post_magnet")  post_magnet();
if (part == "plate")        plate();
if (part == "assembly")     cube_view(0);
if (part == "exploded")     cube_view(45);

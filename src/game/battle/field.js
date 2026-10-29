// Battle field geometry shared by the simulation, the 3D view and arena
// environments. The battle is a single side-view lane along X (Battle Cats
// style): your Lab (king tower) on the left, a guard turret in front of each
// Lab (princess tower), and the field centre at x = 0.
export const FIELD = {
  LAB_X: 12, // centre of each Lab
  LAB_HALF: 1.7, // half-width of a Lab's front face
  TURRET_X: 7.2, // centre of each guard turret
  TURRET_HALF: 0.8,
  LANE_Z: 0.9, // units walk at z in [-LANE_Z, LANE_Z]
  LANE_HALF: 2.4, // half-depth of the walkable lane ground (z)
  VIEW_X: 15.8, // the camera never shows past x = ±VIEW_X (+ margin)
  DEPLOY_MAX: -0.6, // the player may drop troops from their Lab up to this x (own half)
  DEPLOY_BEHIND: 0.6, // ...or up to this far behind their frontmost Swarm when it has pushed further (sim.deployRange)
  DEPLOY_FWD: 4.4, // ...but never past this x (the rival base's zapper range)
};

// Arena environments should keep anything taller than ~0.5 units out of
// z in [0.6 .. 6] (between the lane and the camera) so units stay visible.
export const FOREGROUND_Z = [2.6, 7];

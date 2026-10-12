/**
 * Pointer interaction with the exterior model: hover highlight, click-to-select and
 * camera focus. Keeps hover state outside React to avoid re-rendering on pointer moves.
 */
import type { ThreeEvent } from '@react-three/fiber';
import { Mesh } from 'three';
import { focusObjects, getControls, onControls } from '../camera/controls';
import { useUI } from '../state/ui';
import { useTools } from '../tools/toolsState';
import { applyMaterialModes } from './materialDirector';
import { getRig, onRig } from './rig';
import { resolveSelection, unitByNode, type SelectionUnit } from './selection';

let hover: SelectionUnit | null = null;
let selected: SelectionUnit | null = null;

export function refreshMaterials(): void {
  const rig = getRig();
  if (!rig) return;
  const ui = useUI.getState();
  applyMaterialModes(rig, {
    isolate: ui.isolate,
    xray: ui.xray.enabled,
    skinOpacity: ui.xray.skinOpacity,
    hover: new Set<Mesh>(hover?.meshes ?? []),
    selected: new Set<Mesh>(selected?.meshes ?? []),
  });
}

function syncSelection() {
  const { selected: id, selectedNode } = useUI.getState();
  selected = id && selectedNode ? unitByNode(selectedNode, id) : null;
  refreshMaterials();
}

// Re-apply whenever relevant UI state changes or the rig is swapped (LOD upgrade).
useUI.subscribe((s, p) => {
  if (s.selected !== p.selected || s.selectedNode !== p.selectedNode) syncSelection();
  else if (s.isolate !== p.isolate || s.xray !== p.xray) refreshMaterials();
});
onRig(() => {
  hover = null;
  syncSelection();
});

const interactive = () => {
  const s = useUI.getState();
  return !s.photoMode && useTools.getState().pick === 'none' && (s.section === 'explore' || s.section === 'anatomy' || s.section === 'systems' || s.section === 'specs');
};

export function onPointerMove(e: ThreeEvent<PointerEvent>): void {
  if (!interactive()) return;
  e.stopPropagation();
  const unit = resolveSelection(e.object);
  const same = unit && hover && unit.node === hover.node && unit.partId === hover.partId;
  if (same) return;
  hover = unit;
  document.body.style.cursor = unit ? 'pointer' : '';
  useUI.setState({ hovered: unit?.partId ?? null });
  refreshMaterials();
}

export function onPointerOut(): void {
  if (!hover) return;
  hover = null;
  document.body.style.cursor = '';
  useUI.setState({ hovered: null });
  refreshMaterials();
}

export function onClick(e: ThreeEvent<MouseEvent>): void {
  if (!interactive() || e.delta > 4) return;
  e.stopPropagation();
  const unit = resolveSelection(e.object);
  if (!unit) return;
  selectUnit(unit);
}

export function selectUnit(unit: SelectionUnit, focus = true): void {
  useUI.getState().select(unit.partId, unit.node.name);
  if (focus) void focusObjects(unit.meshes.length ? unit.meshes : [unit.node]);
}

/** Select the first instance of a catalogue part (used by the parts browser). */
export function selectPart(partId: string, focus = true): void {
  const rig = getRig();
  const m = rig?.partMeshes.get(partId)?.[0];
  if (!m) return;
  const unit = resolveSelection(m, rig);
  if (unit) selectUnit(unit, focus);
}

export function clearSelection(): void {
  useUI.getState().select(null);
}

// Camera collision avoidance: the orbit camera may not pass through the outer skin
// (disabled in X-ray / section views, where looking inside is the point).
const COLLIDER_PARTS = new Set(['fuselage', 'bellyFairing', 'wing', 'htp', 'vtp', 'fanCowl', 'engineInlet']);
function updateColliders() {
  const c = getControls();
  const rig = getRig();
  if (!c || !rig) return;
  const ui = useUI.getState();
  const off = ui.xray.enabled || ui.xray.clip > 0 || ui.xray.clipVertical > 0 || ui.explode > 0.01;
  c.colliderMeshes = off ? [] : rig.meshes.filter((m) => COLLIDER_PARTS.has(m.userData.partId as string));
}
onRig(updateColliders);
onControls(updateColliders);
useUI.subscribe((s, p) => {
  if (s.xray !== p.xray || (s.explode > 0.01) !== (p.explode > 0.01)) updateColliders();
});
